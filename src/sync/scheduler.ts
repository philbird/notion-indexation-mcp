import { SyncEngine } from "./sync-engine.js";
import { logger } from "../utils/logger.js";

export class SyncScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private engine: SyncEngine,
    private intervalMinutes: number,
  ) {}

  /**
   * Start the periodic sync scheduler.
   * Runs an initial sync immediately, then schedules recurring syncs.
   */
  start(): void {
    logger.info(`Sync scheduler starting (interval: ${this.intervalMinutes}m)`);

    // Run initial sync in background (don't block)
    this.engine.sync().catch((err) => {
      logger.error("Initial sync failed:", err);
    });

    // Schedule recurring syncs
    const intervalMs = this.intervalMinutes * 60 * 1000;
    this.intervalId = setInterval(() => {
      this.engine.sync().catch((err) => {
        logger.error("Scheduled sync failed:", err);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("Sync scheduler stopped");
    }
  }
}
