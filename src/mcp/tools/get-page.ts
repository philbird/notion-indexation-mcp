import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VectorStore } from "../../vectorstore/store.js";

export function registerGetPageTool(server: McpServer, store: VectorStore): void {
  server.tool(
    "notion_get_page",
    "Retrieve the full indexed text content of a specific Notion page by its ID.",
    {
      page_id: z.string().describe("Notion page ID (with or without dashes)"),
    },
    async ({ page_id }) => {
      // Normalize: remove dashes if present
      const normalizedId = page_id.replace(/-/g, "");
      // Try both formats
      let chunks = await store.getPageChunks(page_id);
      if (chunks.length === 0 && normalizedId !== page_id) {
        chunks = await store.getPageChunks(normalizedId);
      }

      if (chunks.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No indexed content found for page ID: ${page_id}. The page may not have been synced yet.`,
            },
          ],
        };
      }

      const meta = chunks[0].metadata;
      const header = [
        `# ${meta.page_title}`,
        `**URL:** ${meta.page_url}`,
        `**Last edited:** ${meta.last_edited_time}`,
        `**Chunks:** ${chunks.length}`,
        "",
        "---",
        "",
      ].join("\n");

      // Reassemble full page from chunks, stripping the prefix from each
      const body = chunks.map((c) => c.document).join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: header + body,
          },
        ],
      };
    },
  );
}
