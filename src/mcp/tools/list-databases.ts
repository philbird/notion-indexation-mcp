import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VectorStore } from "../../vectorstore/store.js";

export function registerListDatabasesTool(
  server: McpServer,
  store: VectorStore,
): void {
  server.tool(
    "notion_list_databases",
    "List all Notion databases that have been indexed. Returns database IDs and titles.",
    {},
    async () => {
      // Query ChromaDB for distinct database_id values by sampling metadata
      // We get a batch of chunks and extract unique database IDs
      const results = await store.search("database", 100);

      const databases = new Map<string, { title: string; pageCount: number }>();

      for (const r of results) {
        const dbId = r.metadata.database_id;
        if (!dbId) continue;

        if (!databases.has(dbId)) {
          databases.set(dbId, { title: "", pageCount: 0 });
        }
        const db = databases.get(dbId)!;
        db.pageCount++;
        // Use the first page title as a hint (database entries share a parent)
        if (!db.title) {
          db.title = `Database containing "${r.metadata.page_title}"`;
        }
      }

      if (databases.size === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No databases found in the index. The workspace may not have been synced yet, or there may be no database entries.",
            },
          ],
        };
      }

      const lines = [`# Indexed Databases\n`];
      for (const [id, info] of databases) {
        lines.push(`- **${info.title}** (ID: \`${id}\`, ~${info.pageCount} indexed entries)`);
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
