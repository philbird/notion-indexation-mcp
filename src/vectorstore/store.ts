import { ChromaClient, type Collection, type Metadata, type Where, IncludeEnum } from "chromadb";
import { OllamaEmbeddingFunction } from "./embedder.js";
import type { IndexedChunk, ChunkMetadata } from "./types.js";
import { logger } from "../utils/logger.js";
import type { Config } from "../config.js";

export class VectorStore {
  private client: ChromaClient;
  private embedder: OllamaEmbeddingFunction;
  private collectionName: string;
  private collection: Collection | null = null;

  constructor(config: Config) {
    this.client = new ChromaClient({ host: config.chromaUrl });
    this.embedder = new OllamaEmbeddingFunction(config);
    this.collectionName = config.chromaCollection;
  }

  async init(): Promise<void> {
    this.collection = await this.client.getOrCreateCollection({
      name: this.collectionName,
      embeddingFunction: this.embedder,
      metadata: { "hnsw:space": "cosine" },
    });
    logger.info(`ChromaDB collection "${this.collectionName}" ready`);
  }

  private getCollection(): Collection {
    if (!this.collection) {
      throw new Error("VectorStore not initialized. Call init() first.");
    }
    return this.collection;
  }

  /**
   * Upsert chunks into the collection. Batches in groups of 100.
   */
  async upsertChunks(chunks: IndexedChunk[]): Promise<void> {
    const col = this.getCollection();
    const batchSize = 100;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      await col.upsert({
        ids: batch.map((c) => c.id),
        documents: batch.map((c) => c.document),
        metadatas: batch.map((c) => c.metadata as unknown as Metadata),
      });
      logger.debug(`Upserted batch ${i / batchSize + 1} (${batch.length} chunks)`);
    }
  }

  /**
   * Delete all chunks for a given page.
   */
  async deleteByPageId(pageId: string): Promise<void> {
    const col = this.getCollection();
    await col.delete({
      where: { page_id: { $eq: pageId } } as Where,
    });
  }

  /**
   * Semantic search across all indexed content.
   */
  async search(
    query: string,
    nResults: number = 10,
    filters?: { databaseId?: string },
  ): Promise<
    Array<{
      id: string;
      document: string;
      metadata: ChunkMetadata;
      distance: number;
    }>
  > {
    const col = this.getCollection();

    const where = filters?.databaseId
      ? ({ database_id: { $eq: filters.databaseId } } as Where)
      : undefined;

    const results = await col.query({
      queryTexts: [query],
      nResults,
      where,
      include: [IncludeEnum.documents, IncludeEnum.metadatas, IncludeEnum.distances],
    });

    const items: Array<{
      id: string;
      document: string;
      metadata: ChunkMetadata;
      distance: number;
    }> = [];

    if (results.ids[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        items.push({
          id: results.ids[0][i],
          document: results.documents[0]?.[i] ?? "",
          metadata: (results.metadatas[0]?.[i] ?? {}) as unknown as ChunkMetadata,
          distance: results.distances[0]?.[i] ?? 1,
        });
      }
    }

    return items;
  }

  /**
   * Get all chunks for a specific page, ordered by chunk_index.
   */
  async getPageChunks(pageId: string): Promise<
    Array<{ id: string; document: string; metadata: ChunkMetadata }>
  > {
    const col = this.getCollection();

    const results = await col.get({
      where: { page_id: { $eq: pageId } } as Where,
      include: [IncludeEnum.documents, IncludeEnum.metadatas],
    });

    const items: Array<{
      id: string;
      document: string;
      metadata: ChunkMetadata;
    }> = [];

    for (let i = 0; i < results.ids.length; i++) {
      items.push({
        id: results.ids[i],
        document: results.documents[i] ?? "",
        metadata: (results.metadatas[i] ?? {}) as unknown as ChunkMetadata,
      });
    }

    // Sort by chunk_index
    items.sort((a, b) => a.metadata.chunk_index - b.metadata.chunk_index);
    return items;
  }

  /**
   * Get collection statistics.
   */
  async getStats(): Promise<{ count: number }> {
    const col = this.getCollection();
    const count = await col.count();
    return { count };
  }

  /**
   * Health check: verify ChromaDB is reachable.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.heartbeat();
      return true;
    } catch (err) {
      logger.error("Failed to connect to ChromaDB:", err);
      return false;
    }
  }

  /**
   * Health check for the embedder (Ollama).
   */
  async embedderHealthCheck(): Promise<boolean> {
    return this.embedder.healthCheck();
  }
}
