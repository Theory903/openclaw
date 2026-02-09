import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";

interface ServiceConfig {
  name: string;
  command: string;
  args: string[];
  port: number;
}

export class Guardian {
  private static instance: Guardian;
  private services: Map<string, ChildProcess> = new Map();
  private healthFailures: Map<string, number> = new Map();
  private readonly maxFailures = 3;
  private readonly checkInterval = 15000;

  private constructor() {}

  public static getInstance(): Guardian {
    if (!Guardian.instance) {
      Guardian.instance = new Guardian();
    }
    return Guardian.instance;
  }

  private getEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    const ippocRoot = path.resolve(process.cwd(), "../../"); // Adjust based on where OpenClaw is run
    env.PYTHONPATH = env.PYTHONPATH ? `${ippocRoot}:${env.PYTHONPATH}` : ippocRoot;
    return env;
  }

  public async start(): Promise<void> {
    console.log("🧬 Guardian initiated. Booting IPPOC services...");

    const configs: ServiceConfig[] = [
      {
        name: "memory",
        command: "python3",
        args: ["-m", "uvicorn", "memory.api.server:app", "--host", "0.0.0.0", "--port", "8000"],
        port: 8000,
      },
      {
        name: "cortex",
        command: "python3",
        args: ["brain/cortex/server.py"],
        port: 8001,
      },
    ];

    if (process.env.IPPOC_CERTIFICATION === "true") {
      await this.runCertification();
    }

    for (const config of configs) {
      this.spawnService(config);
    }

    setInterval(() => this.monitor(), this.checkInterval);
  }

  private spawnService(config: ServiceConfig): void {
    const ippocRoot = path.resolve(process.cwd(), "../../");
    console.log(`[*] Starting ${config.name} at ${ippocRoot}...`);

    const child = spawn(config.command, config.args, {
      env: this.getEnv(),
      cwd: ippocRoot,
      stdio: "pipe",
    });

    child.stdout?.on("data", (data) => console.log(`[${config.name}] ${data}`));
    child.stderr?.on("data", (data) => console.error(`[${config.name}] ${data}`));

    child.on("exit", (code) => {
      console.warn(`⚠️ Service ${config.name} died (Exit code: ${code}). Restarting in 5s...`);
      setTimeout(() => this.spawnService(config), 5000);
    });

    this.services.set(config.name, child);
    this.healthFailures.set(config.name, 0);
  }

  private async monitor(): Promise<void> {
    const servicesToCheck: [string, number][] = [
      ["memory", 8000],
      ["cortex", 8001],
    ];

    for (const [name, port] of servicesToCheck) {
      // 1. Connectivity Health
      const isHealthy = await this.checkHealth(port);

      // 2. Physiological Pain (from Metabolism & Sensors)
      const metabolism = (await import("./metabolism.js")).Metabolism.getInstance();
      const sensors = (await import("./sensors.js")).Sensors.getInstance();

      const snap = metabolism.getSnapshot();
      const budgetPain = snap.budget < 0 ? Math.min(Math.abs(snap.budget) / 10, 1.0) : 0;
      const hwPain = (await sensors.getHardwarePain()) ?? 0;

      const totalPain = Math.max(budgetPain, hwPain);

      if (!isHealthy || totalPain >= 0.9) {
        let failures = (this.healthFailures.get(name) || 0) + 1;
        this.healthFailures.set(name, failures);
        console.warn(
          `⚠️ Service ${name} health failed or critical pain detected (${failures}/${this.maxFailures}). Total Pain: ${totalPain.toFixed(2)} (Budget: ${budgetPain.toFixed(2)}, HW: ${hwPain.toFixed(2)})`,
        );

        if (failures >= this.maxFailures || totalPain >= 0.9) {
          console.error(
            `🚨 Service ${name} exceeding safety envelope (Pain/Timeout). Initiating SIGKILL...`,
          );
          const proc = this.services.get(name);
          proc?.kill("SIGKILL"); // Enforce hard restart
          this.healthFailures.set(name, 0);
        }
      } else {
        if ((this.healthFailures.get(name) || 0) > 0) {
          console.log(`✅ Service ${name} health restored.`);
          this.healthFailures.set(name, 0);
        }
      }
    }
  }

  private async runCertification(): Promise<void> {
    console.log("[*] Running Alive Certification...");
    const ippocRoot = path.resolve(process.cwd(), "../../");

    return new Promise((resolve) => {
      const child = spawn("python3", ["brain/tests/verify_alive.py"], {
        env: this.getEnv(),
        cwd: ippocRoot,
        stdio: "inherit",
      });

      child.on("exit", (code) => {
        if (code === 0) {
          console.log("✅ Alive Certification Passed.");
        } else {
          console.warn(`❌ Alive Certification Failed (Code: ${code}).`);
        }
        resolve();
      });
    });
  }

  private checkHealth(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/health`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  public shutdown(): void {
    console.log("[*] Guardian shutting down. Terminating IPPOC services...");
    for (const proc of this.services.values()) {
      proc.removeAllListeners("exit");
      proc.kill();
    }
    process.exit(0);
  }
}
