import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { VectorStore } from "../vectorstore/store.js";
import type { SyncEngine } from "../sync/sync-engine.js";
import type { Config } from "../config.js";
import { registerSearchTool } from "./tools/search.js";
import { registerGetPageTool } from "./tools/get-page.js";
import { registerListDatabasesTool } from "./tools/list-databases.js";
import { registerGetDatabaseEntriesTool } from "./tools/get-database-entries.js";
import { registerSyncStatusTool } from "./tools/sync-status.js";
import { logger } from "../utils/logger.js";

export async function startMcpServer(
  config: Config,
  store: VectorStore,
  engine: SyncEngine,
): Promise<McpServer> {
  const server = new McpServer({
    name: "notion-index",
    version: "1.0.0",
  });

  // Register all tools
  registerSearchTool(server, store);
  registerGetPageTool(server, store);
  registerListDatabasesTool(server, store);
  registerGetDatabaseEntriesTool(server, store);
  registerSyncStatusTool(server, engine, store, config);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("MCP server started on stdio");
  return server;
}
