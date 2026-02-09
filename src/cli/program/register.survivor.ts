import type { Command } from "commander";
import { Guardian } from "../../infra/guardian.js";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerSurvivorCommands(program: Command) {
  const survivor = program
    .command("survivor")
    .description("IPPOC Body (The Survivor) Control Plane");

  survivor
    .command("start")
    .description("Start the unified IPPOC node (Guardian + Brain + Gateway)")
    .option("--cert", "Start in Certification Mode (Safe Dry-Run)", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        console.log("🚀 Promoting OpenClaw to Survivor role...");

        if (opts.cert) {
          process.env.IPPOC_CERTIFICATION = "true";
          console.log("🛡️ CERTIFICATION MODE ENABLED: Persistence and spending are mocked.");
        }

        // 1. Initiate Guardian (Spawns Memory & Brain)
        const guardian = Guardian.getInstance();
        await guardian.start();

        // 2. The Gateway is already likely running or about to run via the same process
        // but for a dedicated 'start' command, we might need to wait for signals.
        console.log("✅ Survivor node is active. Monitoring services...");

        process.on("SIGINT", () => guardian.shutdown());
        process.on("SIGTERM", () => guardian.shutdown());
      });
    });
}
