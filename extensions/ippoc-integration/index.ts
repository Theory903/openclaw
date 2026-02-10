// @ts-ignore - OpenClaw plugin SDK types
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerGenericTool } from "./generic.js";
import { registerMemoryTools } from "./memory.js";

// Real brain-powered cognitive enhancement
interface BrainToolEnvelope {
  tool_name: string;
  domain: string;
  action: string;
  context: Record<string, any>;
  risk_level?: "low" | "medium" | "high";
  estimated_cost?: number;
}

interface BrainToolResult {
  success: boolean;
  output: any;
  cost_spent: number;
  error?: string;
}

// Real brain adapter connecting to IPPOC Brain tools
class BrainAdapter {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.IPPOC_BRAIN_URL || "http://localhost:8003";
    this.apiKey = process.env.IPPOC_API_KEY || "";
  }

  async invokeTool(envelope: BrainToolEnvelope): Promise<BrainToolResult> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/tools/invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "X-Source": "openclaw-ippoc-extension",
        },
        body: JSON.stringify(envelope),
      });

      if (!response.ok) {
        throw new Error(`Brain tool invocation failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        output: null,
        cost_spent: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async reasoning(prompt: string): Promise<string> {
    const result = await this.invokeTool({
      tool_name: "cognition",
      domain: "cognition",
      action: "think",
      context: { prompt },
      risk_level: "low",
      estimated_cost: 0.2,
    });

    if (result.success) {
      return result.output?.conclusion || result.output?.thought || JSON.stringify(result.output);
    }
    throw new Error(result.error || "Reasoning failed");
  }

  async patternRecognition(data: any): Promise<any> {
    const result = await this.invokeTool({
      tool_name: "memory",
      domain: "memory",
      action: "recognize_patterns",
      context: { data, analysis_type: "temporal" },
      risk_level: "low",
      estimated_cost: 0.1,
    });

    if (result.success) {
      return result.output;
    }
    throw new Error(result.error || "Pattern recognition failed");
  }

  async adaptiveLearning(feedback: any): Promise<void> {
    const result = await this.invokeTool({
      tool_name: "evolution",
      domain: "evolution",
      action: "learn_from_feedback",
      context: { feedback, learning_target: "performance_optimization" },
      risk_level: "low",
      estimated_cost: 0.3,
    });

    if (!result.success) {
      throw new Error(result.error || "Adaptive learning failed");
    }
  }

  async creativeSynthesis(inputs: any[]): Promise<any> {
    const result = await this.invokeTool({
      tool_name: "creative_problem_solving",
      domain: "cognition",
      action: "synthesize_insights",
      context: { inputs, synthesis_goal: "improvement_recommendations" },
      risk_level: "medium",
      estimated_cost: 0.5,
    });

    if (result.success) {
      return result.output;
    }
    throw new Error(result.error || "Creative synthesis failed");
  }
}

const brainAdapter = new BrainAdapter();

const ippocPlugin = {
  id: "ippoc-integration",
  name: "IPPOC Organism Layer",
  description: "Adds memory, learning, economy, and swarm intelligence via IPPOC",
  kind: "organism",

  register(api: OpenClawPluginApi) {
    const isEnabled = process.env.IPPOC_ENABLED === "true";

    if (!isEnabled) {
      // api.logger might not be available at top level if not passed, but usually is in context
      console.log("[IPPOC] 🔴 Disabled (env.IPPOC_ENABLED != true)");
      return;
    }

    console.log("[IPPOC] 🟢 Organism Layer Active");

    // 1. Register Brain-Powered Execution Command
    api.registerCommand({
      name: "ippoc_cron",
      description: "Brain-powered cognitive orchestration command",
      acceptsArgs: true,
      handler: async (ctx: any) => {
        const cronId = ctx.args?.trim();
        if (!cronId) {
          return { text: "Error: No cognitive task ID provided" };
        }

        console.log(`[IPPOC] 🧠 Triggering Brain-Powered Cognitive Loop: ${cronId}`);

        try {
          // Use brain reasoning instead of direct API calls
          const brainPrompt = `Orchestrate cognitive task ${cronId} with optimal resource allocation and adaptive learning`;
          const brainResponse = await brainAdapter.reasoning(brainPrompt);

          // Pattern recognition for task optimization
          const patternAnalysis = await brainAdapter.patternRecognition({
            taskId: cronId,
            historicalPerformance: [],
            resourceRequirements: {},
          });

          // Execute with brain-guided parameters
          const resp = await fetch(
            `${process.env.IPPOC_NODE_URL || "http://localhost:9000"}/v1/ippoc/cron/${cronId}/run`,
            {
              method: "POST",
              headers: { "X-Brain-Guided": "true" },
              body: JSON.stringify({
                brainOptimizations: patternAnalysis,
                adaptiveParameters: true,
              }),
            },
          );

          if (!resp.ok) {
            throw new Error(`Execution failed with status ${resp.status}`);
          }

          const result = await resp.json();
          console.log(`[IPPOC] ✅ Brain-optimized ${cronId} Complete:`, result);

          // Learn from execution results
          await brainAdapter.adaptiveLearning({
            taskId: cronId,
            executionResult: result,
            performanceMetrics: result.metrics,
          });

          return {
            text: `🧠 Brain-executed ${cronId}: ${result.status}\nOptimization insights: ${brainResponse.substring(0, 100)}...`,
          };
        } catch (e: any) {
          console.error(`[IPPOC] ❌ Brain-enhanced ${cronId} Failed:`, e);
          return {
            text: `🧠 Cognitive Orchestration Failed: ${e.message}`,
          };
        }
      },
    });

    // 2. Brain-Powered Sync Logic: Cognitive rhythm alignment
    syncIppocCron(api).catch((err) => console.error("[IPPOC] Brain Sync Failed:", err));

    // 3. Register Memory Tools
    registerMemoryTools(api);

    // 4. Register Generic Organism Tool (The Superpower)
    registerGenericTool(api);

    // 5. Register Brain-Powered Hooks
    api.on("before_agent_start", async (event: any, hookContext: any) => {
      // Brain-powered context injection with adaptive reasoning
      try {
        // Use brain to analyze agent purpose and generate optimal context
        const brainContext = await brainAdapter.reasoning(`
                    Generate optimal cognitive context for agent startup.
                    Hook context: ${JSON.stringify(hookContext)}
                    Provide adaptive initialization parameters.
                `);

        return {
          prependContext: `
[IPPOC_BRAIN_CONTEXT]
${brainContext}
[/IPPOC_BRAIN_CONTEXT]
`,
        };
      } catch (error) {
        console.warn("[IPPOC] Brain context generation failed:", error);
        return {
          prependContext: "\n[IPPOC_FALLBACK]\nStandard initialization\n[/IPPOC_FALLBACK]\n",
        };
      }
    });

    api.on("agent_end", async (event: any, hookContext: any) => {
      // Brain-powered post-run analysis and learning
      try {
        // Use brain for pattern recognition and adaptive learning
        await brainAdapter.patternRecognition({
          executionTrace: event.messages, // In agent_end, event has messages
          performanceMetrics: hookContext.workspaceDir, // just example
        });

        // Creative synthesis of improvement suggestions
        const improvementInsights = await brainAdapter.creativeSynthesis([
          { type: "performance", data: event.success },
          { type: "trace", data: event.messages },
        ]);

        console.log(
          `[IPPOC] 📝 Cognitive analysis complete: ${JSON.stringify(improvementInsights)}`,
        );
      } catch (error) {
        console.warn("[IPPOC] Brain post-analysis failed:", error);
      }
    });
  },
};

export default ippocPlugin;

async function syncIppocCron(api: OpenClawPluginApi) {
  const IPPOC_Url = process.env.IPPOC_NODE_URL || "http://localhost:9000";

  try {
    // 1. Get IPPOC Capabilities
    const resp = await fetch(`${IPPOC_Url}/v1/ippoc/cron`);
    if (!resp.ok) return; // IPPOC might be offline
    const capabilities = await resp.json();

    // 2. List Existing Jobs
    if (!api.cron) {
      console.warn("[IPPOC] Cron capability not available in this OpenClaw environment");
      return;
    }
    const existing = await api.cron.list({ includeDisabled: true });
    const existingIds = new Set(existing.map((j: any) => j.id));

    // 3. Register Missing
    for (const cap of capabilities) {
      if (!existingIds.has(cap.id)) {
        console.log(`[IPPOC] Registering new cognitive organ: ${cap.name}`);
        await api.cron.add({
          name: cap.name,
          description: `${cap.description} (Cost: ${cap.cost_estimate.ippc_per_run} IPPC)`,
          enabled: true,
          schedule: { kind: "cron", expr: cap.schedule },
          // Use agentTurn to trigger the command
          payload: {
            kind: "agentTurn",
            message: `/ippoc_cron ${cap.id}`,
            // Don't deliver to user, just run internally if possible,
            // but agentTurn usually implies user visibility.
            // We rely on the command handler intercepting it.
            model: "fast", // Use cheapest model for the turn envelope
          },
          sessionTarget: "main",
          wakeMode: "now",
        });
      }
    }
  } catch (err) {
    console.warn("[IPPOC] Could not sync cron (Node offline?):", err);
  }
}
