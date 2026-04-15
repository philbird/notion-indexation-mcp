import { Ollama } from "ollama";
import type { EmbeddingFunction } from "chromadb";
import { logger } from "../utils/logger.js";
import type { Config } from "../config.js";

/**
 * ChromaDB-compatible embedding function backed by Ollama.
 */
export class OllamaEmbeddingFunction implements EmbeddingFunction {
  private ollama: Ollama;
  private model: string;
  name = "ollama";

  constructor(config: Config) {
    this.ollama = new Ollama({ host: config.ollamaUrl });
    this.model = config.ollamaModel;
  }

  async generate(texts: string[]): Promise<number[][]> {
    logger.debug(`Generating embeddings for ${texts.length} texts`);
    const response = await this.ollama.embed({
      model: this.model,
      input: texts,
    });
    return response.embeddings;
  }

  /**
   * Verify that Ollama is reachable and the model is available.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const models = await this.ollama.list();
      const available = models.models.some((m) => m.name.startsWith(this.model));
      if (!available) {
        logger.error(
          `Ollama model "${this.model}" not found. Run: ollama pull ${this.model}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      logger.error("Failed to connect to Ollama:", err);
      return false;
    }
  }
}
