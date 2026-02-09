import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJsonBody } from "../gateway/hooks.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { Metabolism } from "./metabolism.js";

export interface BodyIntent {
  intent_id: string;
  type: "EXECUTE" | "SPEND" | "SIGNAL" | "MAINTAIN";
  tool?: string;
  risk: number;
  expected_value: number;
  justification: string;
  constraints?: {
    timeout_ms?: number;
    max_cost?: number;
    sandbox?: "mandatory" | "preferred" | "none";
  };
}

export type BodyDecision =
  | { status: "APPROVED"; effects: { result: any; cost: number; latency: number } }
  | { status: "THROTTLED"; retry_after_ms: number; reason: "BUDGET" | "CPU" }
  | { status: "DENIED"; reason: string; pain: number };

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export async function handleBodyIntentHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (url.pathname !== "/body/intent") {
    return false;
  }

  console.log(`[IntentBridge] Received ${req.method} request to ${url.pathname}`);
  console.log(`[IntentBridge] Headers: ${JSON.stringify(req.headers)}`);

  if (req.method !== "POST") {
    console.log(`[IntentBridge] Rejecting non-POST request: ${req.method}`);
    sendJson(res, 405, { error: "Method Not Allowed" });
    return true;
  }

  // Token validation
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.OPENCLAW_GATEWAY_TOKEN || "ippoc-dev-token";
  console.log(`[IntentBridge] Expected token: ${expectedToken}, Received auth: ${authHeader}`);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendJson(res, 401, { error: "Missing or invalid Authorization header" });
    return true;
  }
  const token = authHeader.replace("Bearer ", "");
  if (token !== expectedToken) {
    sendJson(res, 401, { error: "Invalid token" });
    return true;
  }

  console.log(`[IntentBridge] Token validated successfully`);

  const body = await readJsonBody(req, 10 * 1024 * 1024); // 10MB limit
  if (!body.ok) {
    sendJson(res, 400, { error: body.error });
    return true;
  }

  const intent = body.value as BodyIntent;
  const metabolism = Metabolism.getInstance();

  // 1. Budget Gating
  const canProceed = metabolism.checkBudget(intent.risk);
  if (!canProceed) {
    const pain = 0.6; // Moderate distress
    sendJson(res, 200, {
      status: "THROTTLED",
      retry_after_ms: 60000,
      reason: "BUDGET",
      pain,
    });
    return true;
  }

  // 2. Action Logic
  const start = Date.now();
  try {
    switch (intent.type) {
      case "SPEND": {
        const cost = intent.constraints?.max_cost ?? 0;
        const success = metabolism.spend(cost, intent.tool);
        if (!success) {
          sendJson(res, 200, { status: "DENIED", reason: "Insufficient Budget", pain: 0.1 });
          return true;
        }
        sendJson(res, 200, {
          status: "APPROVED",
          effects: { result: "Spend Approved", cost, latency: Date.now() - start },
        });
        return true;
      }

      case "EXECUTE": {
        if (!intent.tool) {
          sendJson(res, 200, { status: "DENIED", reason: "Tool Missing", pain: 0 });
          return true;
        }

        // Mocking tool execution for now - in production this would map to actual shell/binaries
        // For 'bash', we use the constraints to run it
        if (intent.tool === "bash") {
          // Basic shell execution - for safety we'd chroot this
          const command = (intent as any).payload?.command;
          if (!command) {
            sendJson(res, 200, { status: "DENIED", reason: "Command Missing", pain: 0 });
            return true;
          }

          const result = await runCommandWithTimeout(command.split(" "), {
            timeoutMs: intent.constraints?.timeout_ms ?? 30000,
          });

          const cost = 0.5; // Base cost for execution
          metabolism.spend(cost, "bash");

          sendJson(res, 200, {
            status: "APPROVED",
            effects: { result, cost: cost, latency: Date.now() - start },
          });
          return true;
        }

        if (intent.tool === "evolution_engine") {
          const { action, diff, channel } = (intent as any).payload || {};

          if (action === "update") {
            const { runGatewayUpdate } = await import("./update-runner.js");
            const result = await runGatewayUpdate({ channel: channel || "dev" });

            sendJson(res, 200, {
              status: "APPROVED",
              effects: { result, cost: 5.0, latency: Date.now() - start },
            });
            return true;
          }

          if (action === "patch") {
            if (!diff) {
              sendJson(res, 200, { status: "DENIED", reason: "Diff Missing", pain: 0 });
              return true;
            }

            // Write diff to temp file and apply
            const tmpPath = path.join(os.tmpdir(), `ippoc_patch_${Date.now()}.diff`);
            fs.writeFileSync(tmpPath, diff);

            const result = await runCommandWithTimeout(["git", "apply", tmpPath], {
              timeoutMs: 10000,
            });

            fs.unlinkSync(tmpPath);

            if (result.code !== 0) {
              sendJson(res, 200, {
                status: "DENIED",
                reason: `Patch failed: ${result.stderr}`,
                pain: 0.3,
              });
              return true;
            }

            sendJson(res, 200, {
              status: "APPROVED",
              effects: { result: "Patch Applied", cost: 2.0, latency: Date.now() - start },
            });
            return true;
          }
        }

        sendJson(res, 200, { status: "DENIED", reason: `Unknown tool: ${intent.tool}`, pain: 0 });
        return true;
      }

      case "MAINTAIN": {
        // Proxy for Brain persistence (Zero Write Policy)
        const { key, value } = (intent as any).payload || {};
        if (!key || !value) {
          sendJson(res, 200, { status: "DENIED", reason: "Maintenance payload missing", pain: 0 });
          return true;
        }

        const { resolveStateDir } = await import("../config/paths.js");
        const stateDir = resolveStateDir();
        const bodyDir = path.join(stateDir, "body");
        const persistencePath = path.join(bodyDir, "persistence.json");

        if (!fs.existsSync(bodyDir)) {
          fs.mkdirSync(bodyDir, { recursive: true });
        }

        // Atomic update of the persistence file
        let data: Record<string, any> = {};
        if (fs.existsSync(persistencePath)) {
          try {
            data = JSON.parse(fs.readFileSync(persistencePath, "utf-8"));
          } catch (e) {
            console.error("Failed to parse persistence.json, resetting...", e);
          }
        }
        data[key] = value;
        fs.writeFileSync(persistencePath, JSON.stringify(data, null, 2), "utf-8");

        sendJson(res, 200, {
          status: "APPROVED",
          effects: { result: `Persisted ${key}`, cost: 0.1, latency: Date.now() - start },
        });
        return true;
      }

      case "SIGNAL": {
        const { action, value, tool } = (intent as any).payload || {};
        if (action === "get_snapshot") {
          const snapshot = metabolism.getSnapshot();
          const sensors = (await import("./sensors.js")).Sensors.getInstance();
          const metrics = sensors.getMetrics();
          const hwPain = sensors.getHardwarePain();

          sendJson(res, 200, {
            status: "APPROVED",
            effects: {
              result: { ...snapshot, sensors: metrics, hardware_pain: hwPain },
              cost: 0,
              latency: Date.now() - start,
            },
          });
          return true;
        }
        if (action === "record_value") {
          metabolism.recordValue(value || 0, 1.0, "brain_signal", tool);
          sendJson(res, 200, {
            status: "APPROVED",
            effects: { result: "Value Recorded", cost: 0, latency: Date.now() - start },
          });
          return true;
        }
        if (action === "get_persistence") {
          const { resolveStateDir } = await import("../config/paths.js");
          const persistencePath = path.join(resolveStateDir(), "body", "persistence.json");
          let data: any = {};
          if (fs.existsSync(persistencePath)) {
            try {
              data = JSON.parse(fs.readFileSync(persistencePath, "utf-8"));
            } catch (e) {
              console.error("Failed to parse persistence.json for read", e);
            }
          }
          sendJson(res, 200, {
            status: "APPROVED",
            effects: { result: data, cost: 0, latency: Date.now() - start },
          });
          return true;
        }
        if (action === "mesh") {
          const { subaction, message, target } = (intent as any).payload || {};
          console.log(
            `[MESH:${subaction}] From Brain: ${JSON.stringify(message)} to ${target || "ALL"}`,
          );

          sendJson(res, 200, {
            status: "APPROVED",
            effects: { result: `Mesh ${subaction} queued`, cost: 0.2, latency: Date.now() - start },
          });
          return true;
        }
        sendJson(res, 200, {
          status: "DENIED",
          reason: `Unknown signal action: ${action}`,
          pain: 0,
        });
        return true;
      }

      default:
        sendJson(res, 200, { status: "DENIED", reason: "Unknown Intent Type", pain: 0 });
        return true;
    }
  } catch (e: any) {
    sendJson(res, 500, { error: e.message });
    return true;
  }
}
