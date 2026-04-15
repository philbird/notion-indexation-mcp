import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VectorStore } from "../../vectorstore/store.js";

export function registerSearchTool(server: McpServer, store: VectorStore): void {
  server.tool(
    "notion_search",
    "Semantic search across all indexed Notion content. Returns relevant chunks with page titles, URLs, and relevance scores.",
    {
      query: z.string().describe("Search query text"),
      limit: z.number().min(1).max(50).default(10).describe("Maximum number of results to return"),
      database_id: z.string().optional().describe("Optional: filter results to a specific Notion database ID"),
    },
    async ({ query, limit, database_id }) => {
      const results = await store.search(query, limit, {
        databaseId: database_id,
      });

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No results found for the given query.",
            },
          ],
        };
      }

      const formatted = results.map((r, i) => {
        const score = (1 - r.distance).toFixed(3);
        return [
          `## Result ${i + 1} (relevance: ${score})`,
          `**Page:** ${r.metadata.page_title}`,
          `**URL:** ${r.metadata.page_url}`,
          r.metadata.heading_path ? `**Section:** ${r.metadata.heading_path}` : "",
          "",
          r.document,
        ]
          .filter(Boolean)
          .join("\n");
      });

      return {
        content: [
          {
            type: "text" as const,
            text: formatted.join("\n\n---\n\n"),
          },
        ],
      };
    },
  );
}
