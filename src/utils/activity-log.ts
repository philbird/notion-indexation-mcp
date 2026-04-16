import { writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import type { Config } from "../config.js";

export function logActivity(
  config: Config,
  event: string,
  data?: Record<string, unknown>,
): void {
  if (!config.activityLogDir) return;

  try {
    mkdirSync(config.activityLogDir, { recursive: true });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const logPath = join(config.activityLogDir, `${dateStr}.jsonl`);

    const entry: Record<string, unknown> = {
      ts: now.toISOString(),
      source: "notion-sync",
      event,
    };
    if (data) entry.data = data;

    appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Activity logging is best-effort — never crash the server
  }
}
