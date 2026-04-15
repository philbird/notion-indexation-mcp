import { readFile, writeFile } from "node:fs/promises";
import { logger } from "../utils/logger.js";

export interface SyncState {
  lastSyncTime: string | null;
  knownPageIds: string[];
  lastFullSyncTime: string | null;
  stats: {
    pagesIndexed: number;
    chunksStored: number;
    lastDurationMs: number;
  };
}

const DEFAULT_STATE: SyncState = {
  lastSyncTime: null,
  knownPageIds: [],
  lastFullSyncTime: null,
  stats: {
    pagesIndexed: 0,
    chunksStored: 0,
    lastDurationMs: 0,
  },
};

export class SyncStateManager {
  constructor(private filePath: string) {}

  async load(): Promise<SyncState> {
    try {
      const data = await readFile(this.filePath, "utf-8");
      return { ...DEFAULT_STATE, ...JSON.parse(data) };
    } catch {
      logger.info("No existing sync state found, starting fresh");
      return { ...DEFAULT_STATE };
    }
  }

  async save(state: SyncState): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf-8");
    logger.debug("Sync state saved");
  }
}
