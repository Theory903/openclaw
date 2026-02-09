import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export interface ToolStats {
  calls: number;
  failures: number;
  totalSpent: number;
  totalValue: number;
}

export interface EconomyState {
  budget: number;
  reserve: number;
  regenRate: number; // budget per minute
  lastTick: number;
  totalSpent: number;
  totalValue: number;
  toolStats: Record<string, ToolStats>;
  events: any[];
}

export class Metabolism {
  private static instance: Metabolism;
  private path: string;
  private state: EconomyState;

  private constructor() {
    const stateDir = resolveStateDir();
    // Use data/body/ for mutable physiological state, NOT genome.
    this.path = path.join(stateDir, "body", "economy.json");
    this.state = this.load();
  }

  public static getInstance(): Metabolism {
    if (!Metabolism.instance) {
      Metabolism.instance = new Metabolism();
    }
    return Metabolism.instance;
  }

  private load(): EconomyState {
    const defaultBudget = 300.0;
    const defaultReserve = 100.0;
    const regenRate = 0.0;

    if (fs.existsSync(this.path)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.path, "utf-8"));
        return {
          budget: Number(data.budget ?? defaultBudget),
          reserve: Number(data.reserve ?? defaultReserve),
          regenRate: Number(data.regenRate ?? regenRate),
          lastTick: Number(data.lastTick ?? Date.now()),
          totalSpent: Number(data.totalSpent ?? 0),
          totalValue: Number(data.totalValue ?? 0),
          toolStats: data.toolStats ?? {},
          events: data.events ?? [],
        };
      } catch (e) {
        console.error("[metabolism] Failed to load economy state:", e);
      }
    }

    return {
      budget: defaultBudget,
      reserve: defaultReserve,
      regenRate: regenRate,
      lastTick: Date.now(),
      totalSpent: 0,
      totalValue: 0,
      toolStats: {},
      events: [],
    };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.path), { recursive: true });
      fs.writeFileSync(this.path, JSON.stringify(this.state, null, 2), "utf-8");
    } catch (e) {
      console.error("[metabolism] Failed to save economy state:", e);
    }
  }

  public tick(): void {
    const now = Date.now();
    const elapsedMin = Math.max((now - this.state.lastTick) / 60000.0, 0);
    if (elapsedMin <= 0) {
      return;
    }

    if (this.state.regenRate > 0) {
      const regen = elapsedMin * this.state.regenRate;
      this.state.budget = Math.min(
        this.state.budget + regen,
        this.state.budget + this.state.reserve,
      );
    }

    this.state.lastTick = now;
    this.save();
  }

  public spend(cost: number, toolName?: string, failed: boolean = false): boolean {
    this.tick();
    if (cost > this.state.budget) {
      return false;
    }

    this.state.budget -= cost;
    this.state.totalSpent += cost;

    if (toolName) {
      const stats = this.state.toolStats[toolName] || {
        calls: 0,
        failures: 0,
        totalSpent: 0,
        totalValue: 0,
      };
      stats.totalSpent += cost;
      stats.calls += 1;
      if (failed) {
        stats.failures += 1;
      }
      this.state.toolStats[toolName] = stats;
    }

    this.appendEvent({
      kind: "spend",
      tool: toolName,
      cost,
      failed,
      ts: Date.now(),
    });
    this.save();
    return true;
  }

  public recordValue(
    value: number,
    confidence: number = 1.0,
    source: string = "unknown",
    toolName?: string,
  ): void {
    this.state.totalValue += value;

    if (toolName) {
      const stats = this.state.toolStats[toolName] || {
        calls: 0,
        failures: 0,
        totalSpent: 0,
        totalValue: 0,
      };
      stats.totalValue += value;
      this.state.toolStats[toolName] = stats;
    }

    const decayFactor = 1.0; // Could be env-driven
    const realizedValue = value * confidence * decayFactor;

    if (realizedValue > 0) {
      this.state.budget = Math.min(
        this.state.budget + realizedValue,
        this.state.budget + this.state.reserve,
      );
    }

    this.appendEvent({
      kind: "value",
      tool: toolName,
      value,
      confidence,
      source,
      realized: realizedValue,
      ts: Date.now(),
    });
    this.save();
  }

  private appendEvent(event: any): void {
    const maxEvents = 500;
    this.state.events.push(event);
    if (this.state.events.length > maxEvents) {
      this.state.events.shift();
    }
  }

  public checkBudget(priority: number): boolean {
    this.tick();

    // Vitality check (simplified)
    if (this.state.budget < -5.0) {
      return priority > 0.8;
    }
    if (this.state.budget < 0.0) {
      return priority > 0.5;
    }
    return true;
  }

  /**
   * The Brain may only receive snapshots; it may never mutate economy state directly.
   */
  public getSnapshot(): EconomyState {
    this.tick();
    return { ...this.state };
  }
}
