export interface Config {
  notionToken: string;
  chromaUrl: string;
  chromaCollection: string;
  ollamaUrl: string;
  ollamaModel: string;
  syncIntervalMinutes: number;
  syncStatePath: string;
  logLevel: "debug" | "info" | "warn" | "error";
  chunkMaxTokens: number;
  embeddingDimensions: number;
}

export function loadConfig(): Config {
  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) {
    throw new Error("NOTION_TOKEN environment variable is required");
  }

  return {
    notionToken,
    chromaUrl: process.env.CHROMA_URL ?? "http://localhost:8000",
    chromaCollection: process.env.CHROMA_COLLECTION ?? "notion-index",
    ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "nomic-embed-text",
    syncIntervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES ?? "30", 10),
    syncStatePath: process.env.SYNC_STATE_PATH ?? "./sync-state.json",
    logLevel: (process.env.LOG_LEVEL as Config["logLevel"]) ?? "info",
    chunkMaxTokens: parseInt(process.env.CHUNK_MAX_TOKENS ?? "512", 10),
    embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS ?? "768", 10),
  };
}
