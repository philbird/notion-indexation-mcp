import type { RichTextItemResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { NotionClient, extractPageTitle, extractParent } from "./client.js";
import type { NotionPage, NotionDatabase, PageContent } from "./types.js";
import type { Config } from "../config.js";
import { logger } from "../utils/logger.js";
import PQueue from "p-queue";

export class NotionCrawler {
  private client: NotionClient;
  private queue: PQueue;

  constructor(config: Config) {
    this.client = new NotionClient(config);
    this.queue = new PQueue({ concurrency: 3 });
  }

  /**
   * Enumerate all pages in the workspace.
   * For incremental sync, pass sinceTime to stop at pages older than that.
   */
  async *discoverPages(sinceTime?: string): AsyncGenerator<NotionPage> {
    logger.info("Discovering pages...", sinceTime ? `since ${sinceTime}` : "(full scan)");
    let count = 0;

    for await (const page of this.client.searchPages({
      direction: "descending",
    })) {
      const lastEdited = page.last_edited_time;

      if (sinceTime && lastEdited <= sinceTime) {
        logger.info(`Reached pages older than ${sinceTime}, stopping discovery. Found ${count} updated pages.`);
        return;
      }

      if (page.archived) continue;

      const parent = extractParent(page);
      yield {
        id: page.id,
        title: extractPageTitle(page),
        url: page.url,
        lastEditedTime: lastEdited,
        createdTime: page.created_time,
        parentType: parent.type,
        parentId: parent.id,
        archived: false,
      };
      count++;
    }

    logger.info(`Discovery complete. Found ${count} pages.`);
  }

  /**
   * Discover all databases in the workspace.
   */
  async *discoverDatabases(): AsyncGenerator<NotionDatabase> {
    logger.info("Discovering databases...");

    for await (const ds of this.client.searchDatabases()) {
      const title = ds.title.map((t: RichTextItemResponse) => t.plain_text).join("");
      const description = ds.description.map((t: RichTextItemResponse) => t.plain_text).join("");

      const properties: Record<string, { type: string; name: string }> = {};
      for (const [key, prop] of Object.entries(ds.properties)) {
        properties[key] = { type: prop.type, name: prop.name };
      }

      yield {
        id: ds.id,
        title,
        url: ds.url,
        lastEditedTime: ds.last_edited_time,
        description,
        properties,
      };
    }
  }

  /**
   * Fetch the full markdown content for a page.
   */
  async fetchPageContent(page: NotionPage): Promise<PageContent> {
    try {
      const mdResponse = await this.client.getPageMarkdown(page.id);
      return {
        page,
        markdown: mdResponse.markdown,
        truncated: mdResponse.truncated,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Failed to fetch markdown for page "${page.title}" (${page.id}): ${message}`);
      return {
        page,
        markdown: "",
        truncated: false,
      };
    }
  }

  /**
   * Fetch content for multiple pages concurrently (rate-limited).
   */
  async *fetchPagesContent(pages: NotionPage[]): AsyncGenerator<PageContent> {
    const results: PageContent[] = [];
    const promises = pages.map((page) =>
      this.queue.add(async () => {
        const content = await this.fetchPageContent(page);
        results.push(content);
        return content;
      }),
    );

    await Promise.all(promises);

    for (const result of results) {
      yield result;
    }
  }
}
