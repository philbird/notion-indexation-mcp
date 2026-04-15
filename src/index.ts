import { loadConfig } from "./config.js";
import { setLogLevel, logger } from "./utils/logger.js";
import { VectorStore } from "./vectorstore/store.js";
import { SyncEngine } from "./sync/sync-engine.js";
import { SyncScheduler } from "./sync/scheduler.js";
import { startMcpServer } from "./mcp/server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  logger.info("Starting Notion Indexation MCP Server...");

  // Initialize vector store
  const store = new VectorStore(config);

  // Health checks
  const chromaOk = await store.healthCheck();
  if (!chromaOk) {
    logger.error("ChromaDB is not reachable. Please ensure it is running.");
    logger.error("Start it with: chroma run");
    process.exit(1);
  }

  const ollamaOk = await store.embedderHealthCheck();
  if (!ollamaOk) {
    logger.error("Ollama is not reachable or the model is not available.");
    logger.error(`Ensure Ollama is running and run: ollama pull ${config.ollamaModel}`);
    process.exit(1);
  }

  await store.init();
  logger.info("Vector store initialized");

  // Set up sync engine and scheduler
  const engine = new SyncEngine(config, store);
  const scheduler = new SyncScheduler(engine, config.syncIntervalMinutes);

  // Start MCP server (must happen before scheduler so stdio is connected)
  await startMcpServer(config, store, engine);

  // Start background sync
  scheduler.start();

  // Graceful shutdown
  const shutdown = (): void => {
    logger.info("Shutting down...");
    scheduler.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
