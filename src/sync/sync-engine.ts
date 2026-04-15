import { NotionCrawler } from "../notion/crawler.js";
import { VectorStore } from "../vectorstore/store.js";
import { chunkPageContent } from "../chunking/chunker.js";
import { SyncStateManager, type SyncState } from "./state.js";
import type { NotionPage } from "../notion/types.js";
import type { Config } from "../config.js";
import { logger } from "../utils/logger.js";

export class SyncEngine {
  private crawler: NotionCrawler;
  private store: VectorStore;
  private stateManager: SyncStateManager;
  private config: Config;
  private _isSyncing = false;
  private _lastState: SyncState | null = null;

  constructor(config: Config, store: VectorStore) {
    this.crawler = new NotionCrawler(config);
    this.store = store;
    this.stateManager = new SyncStateManager(config.syncStatePath);
    this.config = config;
  }

  get isSyncing(): boolean {
    return this._isSyncing;
  }

  get lastState(): SyncState | null {
    return this._lastState;
  }

  /**
   * Run a sync cycle. If forceFull is true, re-indexes everything.
   * Otherwise, does incremental sync based on last sync time.
   */
  async sync(forceFull: boolean = false): Promise<void> {
    if (this._isSyncing) {
      logger.warn("Sync already in progress, skipping");
      return;
    }

    this._isSyncing = true;
    const startTime = Date.now();

    try {
      const state = await this.stateManager.load();
      const isIncremental = !forceFull && state.lastSyncTime !== null;

      logger.info(
        isIncremental
          ? `Starting incremental sync (since ${state.lastSyncTime})`
          : "Starting full sync",
      );

      let pagesProcessed = 0;
      let chunksStored = 0;
      const currentPageIds: string[] = [];
      const syncTimestamp = new Date().toISOString();

      // Discover and process pages
      const sinceTime = isIncremental ? state.lastSyncTime! : undefined;
      const pages: NotionPage[] = [];

      for await (const page of this.crawler.discoverPages(sinceTime)) {
        pages.push(page);
        currentPageIds.push(page.id);
      }

      // Process pages in batches
      for (const page of pages) {
        try {
          const content = await this.crawler.fetchPageContent(page);

          if (!content.markdown.trim()) {
            logger.debug(`Skipping empty page: "${page.title}"`);
            continue;
          }

          // Chunk the content
          const chunks = chunkPageContent(page, content.markdown, this.config.chunkMaxTokens);

          if (chunks.length === 0) continue;

          // Delete old chunks for this page, then upsert new ones
          await this.store.deleteByPageId(page.id);
          await this.store.upsertChunks(chunks);

          pagesProcessed++;
          chunksStored += chunks.length;

          if (pagesProcessed % 10 === 0) {
            logger.info(`Progress: ${pagesProcessed} pages processed, ${chunksStored} chunks stored`);
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`Failed to sync page "${page.title}" (${page.id}): ${message}`);
          // Continue with next page
        }
      }

      // On full sync, detect and remove deleted pages
      if (!isIncremental && state.knownPageIds.length > 0) {
        const currentIdSet = new Set(currentPageIds);
        const deletedIds = state.knownPageIds.filter((id) => !currentIdSet.has(id));
        for (const id of deletedIds) {
          try {
            await this.store.deleteByPageId(id);
            logger.info(`Removed deleted page: ${id}`);
          } catch {
            logger.warn(`Failed to remove deleted page: ${id}`);
          }
        }
      }

      // Update state
      const newState: SyncState = {
        lastSyncTime: syncTimestamp,
        knownPageIds: isIncremental
          ? [...new Set([...state.knownPageIds, ...currentPageIds])]
          : currentPageIds,
        lastFullSyncTime: isIncremental ? state.lastFullSyncTime : syncTimestamp,
        stats: {
          pagesIndexed: pagesProcessed,
          chunksStored,
          lastDurationMs: Date.now() - startTime,
        },
      };

      await this.stateManager.save(newState);
      this._lastState = newState;

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(
        `Sync complete: ${pagesProcessed} pages, ${chunksStored} chunks in ${duration}s`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Sync failed: ${message}`);
      throw err;
    } finally {
      this._isSyncing = false;
    }
  }

  /**
   * Load the current state (for status reporting).
   */
  async loadState(): Promise<SyncState> {
    if (this._lastState) return this._lastState;
    this._lastState = await this.stateManager.load();
    return this._lastState;
  }
}
