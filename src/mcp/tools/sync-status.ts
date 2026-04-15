import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SyncEngine } from "../../sync/sync-engine.js";
import type { VectorStore } from "../../vectorstore/store.js";
import type { Config } from "../../config.js";

export function registerSyncStatusTool(
  server: McpServer,
  engine: SyncEngine,
  store: VectorStore,
  config: Config,
): void {
  server.tool(
    "notion_sync_status",
    "Check the current sync status: last sync time, pages indexed, chunks stored, and whether a sync is in progress.",
    {},
    async () => {
      const state = await engine.loadState();
      const storeStats = await store.getStats();

      const lines = [
        "# Notion Index Sync Status\n",
        `**Currently syncing:** ${engine.isSyncing ? "Yes" : "No"}`,
        `**Last sync:** ${state.lastSyncTime ?? "Never"}`,
        `**Last full sync:** ${state.lastFullSyncTime ?? "Never"}`,
        `**Pages indexed (last run):** ${state.stats.pagesIndexed}`,
        `**Chunks stored (last run):** ${state.stats.chunksStored}`,
        `**Last sync duration:** ${(state.stats.lastDurationMs / 1000).toFixed(1)}s`,
        `**Total chunks in collection:** ${storeStats.count}`,
        `**Known pages:** ${state.knownPageIds.length}`,
        `**Sync interval:** ${config.syncIntervalMinutes} minutes`,
      ];

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n"),
          },
        ],
      };
    },
  );

  server.tool(
    "notion_trigger_sync",
    "Trigger an immediate sync of Notion content. Can be incremental or a full re-index.",
    {
      full: z
        .boolean()
        .default(false)
        .describe("Force a full re-index instead of incremental sync"),
    },
    async ({ full }) => {
      if (engine.isSyncing) {
        return {
          content: [
            {
              type: "text" as const,
              text: "A sync is already in progress. Please wait for it to complete.",
            },
          ],
        };
      }

      // Trigger sync in background
      engine.sync(full).catch(() => {
        // Errors are logged by the engine
      });

      return {
        content: [
          {
            type: "text" as const,
            text: full
              ? "Full re-index triggered. This may take a while depending on workspace size. Use notion_sync_status to check progress."
              : "Incremental sync triggered. Use notion_sync_status to check progress.",
          },
        ],
      };
    },
  );
}
