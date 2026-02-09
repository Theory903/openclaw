import { execSync } from "node:child_process";
import process from "node:process";

export interface SystemMetrics {
  cpuUsage: number; // 0.0 to 1.0
  memoryUsage: number; // 0.0 to 1.0
  batteryLevel?: number; // 0.0 to 1.0
  temperature?: number; // Celsius
  isThrottled: boolean;
  timestamp: number;
}

export class Sensors {
  private static instance: Sensors;

  private constructor() {}

  public static getInstance(): Sensors {
    if (!Sensors.instance) {
      Sensors.instance = new Sensors();
    }
    return Sensors.instance;
  }

  public getMetrics(): SystemMetrics {
    const mem = process.memoryUsage();
    const totalMem = 16 * 1024 * 1024 * 1024; // Mocking 16GB, in prod use 'os' module

    // Simple mock metrics for now - in production use 'systeminformation' library
    // For IPPOC Body, we prefer native shell calls for maximum authority
    let cpuLoad = 0.1;
    try {
      // macOS specific load average
      const load = execSync("sysctl -n vm.loadavg").toString();
      cpuLoad = parseFloat(load.split(" ")[1]) / 8; // Normalized by 8 cores
    } catch (e) {}

    return {
      cpuUsage: Math.min(cpuLoad, 1.0),
      memoryUsage: mem.rss / totalMem,
      isThrottled: cpuLoad > 0.8,
      timestamp: Date.now(),
    };
  }

  /**
   * Calculates the 'Pain' level based on hardware stress.
   */
  public async getHardwarePain(): Promise<number | null> {
    let metrics: SystemMetrics;
    try {
      metrics = this.getMetrics();
    } catch (e: any) {
      console.error(`Sensor failure: ${e.message}`);

      // HAL Enhancement: Pain Reporting
      try {
        const { HAL } = await import("./hal/index.js");
        const { PainLevel } = await import("./hal/physiology/pain-aggregator.js");

        HAL.getInstance().physiology.pain.report(
          "sensor-network",
          PainLevel.LOW, // Sensor glich is low pain
          `Sensor read failed: ${e.message}`,
        );
      } catch {}

      return null;
    }

    let pain = 0;

    // CPU Pain
    if (metrics.cpuUsage > 0.7) {
      pain += (metrics.cpuUsage - 0.7) * 2;
    }
    // Memory Pain
    if (metrics.memoryUsage > 0.8) {
      pain += (metrics.memoryUsage - 0.8) * 3;
    }
    // Throttling Hard-Pain
    if (metrics.isThrottled) {
      pain += 0.3;
    }

    return Math.min(pain, 1.0);
  }
}
