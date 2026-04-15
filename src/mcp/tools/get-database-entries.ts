import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VectorStore } from "../../vectorstore/store.js";

export function registerGetDatabaseEntriesTool(
  server: McpServer,
  store: VectorStore,
): void {
  server.tool(
    "notion_get_database_entries",
    "Query indexed entries from a specific Notion database, optionally with a semantic search.",
    {
      database_id: z.string().describe("Notion database ID"),
      query: z
        .string()
        .optional()
        .describe("Optional semantic search query to filter entries"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of results"),
    },
    async ({ database_id, query, limit }) => {
      const searchQuery = query ?? "";
      const results = await store.search(
        searchQuery || "entry",
        limit,
        { databaseId: database_id },
      );

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No entries found for database ID: ${database_id}`,
            },
          ],
        };
      }

      // Group by page to avoid showing duplicate chunks from the same entry
      const pages = new Map<
        string,
        { title: string; url: string; firstChunk: string; score: number }
      >();

      for (const r of results) {
        if (!pages.has(r.metadata.page_id)) {
          pages.set(r.metadata.page_id, {
            title: r.metadata.page_title,
            url: r.metadata.page_url,
            firstChunk: r.document,
            score: 1 - r.distance,
          });
        }
      }

      const lines = [`# Database Entries (${pages.size} results)\n`];
      for (const [_id, entry] of pages) {
        lines.push(`## ${entry.title}`);
        lines.push(`**URL:** ${entry.url}`);
        if (query) {
          lines.push(`**Relevance:** ${entry.score.toFixed(3)}`);
        }
        lines.push("");
        // Show a preview of the content
        const preview =
          entry.firstChunk.length > 500
            ? entry.firstChunk.slice(0, 500) + "..."
            : entry.firstChunk;
        lines.push(preview);
        lines.push("\n---\n");
      }

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
}
