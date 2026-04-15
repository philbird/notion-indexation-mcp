import { Client } from "@notionhq/client";
import type {
  SearchResponse,
  PageObjectResponse,
  GetPageMarkdownResponse,
  DataSourceObjectResponse,
  ListCommentsResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import { logger } from "../utils/logger.js";
import type { Config } from "../config.js";

export class NotionClient {
  private client: Client;
  private rateLimiter: RateLimiter;

  constructor(config: Config) {
    this.client = new Client({
      auth: config.notionToken,
      retry: { maxRetries: 3, initialRetryDelayMs: 1000 },
    });
    this.rateLimiter = new RateLimiter(3, 1000);
  }

  /**
   * Search all pages in the workspace, paginated.
   */
  async *searchPages(
    sort?: { direction: "ascending" | "descending" },
  ): AsyncGenerator<PageObjectResponse> {
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      await this.rateLimiter.acquire();
      const response: SearchResponse = await this.client.search({
        filter: { property: "object", value: "page" },
        sort: sort
          ? { timestamp: "last_edited_time", direction: sort.direction }
          : undefined,
        start_cursor: cursor,
        page_size: 100,
      });

      for (const result of response.results) {
        if ("properties" in result && "object" in result && result.object === "page") {
          yield result as PageObjectResponse;
        }
      }

      hasMore = response.has_more;
      cursor = response.next_cursor ?? undefined;
    }
  }

  /**
   * Search all databases (data_sources) in the workspace, paginated.
   */
  async *searchDatabases(): AsyncGenerator<DataSourceObjectResponse> {
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      await this.rateLimiter.acquire();
      const response: SearchResponse = await this.client.search({
        filter: { property: "object", value: "data_source" },
        start_cursor: cursor,
        page_size: 100,
      });

      for (const result of response.results) {
        if ("title" in result && "object" in result && result.object === "data_source") {
          yield result as DataSourceObjectResponse;
        }
      }

      hasMore = response.has_more;
      cursor = response.next_cursor ?? undefined;
    }
  }

  /**
   * Get a page's full content as markdown (single API call).
   */
  async getPageMarkdown(pageId: string): Promise<GetPageMarkdownResponse> {
    await this.rateLimiter.acquire();
    return this.client.pages.retrieveMarkdown({ page_id: pageId });
  }

  /**
   * Get page metadata.
   */
  async getPage(pageId: string): Promise<PageObjectResponse> {
    await this.rateLimiter.acquire();
    return this.client.pages.retrieve({
      page_id: pageId,
    }) as Promise<PageObjectResponse>;
  }

  /**
   * List comments on a page/block.
   */
  async getComments(blockId: string): Promise<ListCommentsResponse> {
    await this.rateLimiter.acquire();
    return this.client.comments.list({ block_id: blockId });
  }
}

/**
 * Extract the title from a PageObjectResponse.
 */
export function extractPageTitle(page: PageObjectResponse): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title" && "title" in prop) {
      const titleParts = prop.title as Array<{ plain_text: string }>;
      return titleParts.map((t) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

/**
 * Extract parent info from a page.
 */
export function extractParent(page: PageObjectResponse): {
  type: "database_id" | "page_id" | "workspace";
  id: string | null;
} {
  const parent = page.parent;
  if (parent.type === "database_id") {
    return { type: "database_id", id: parent.database_id };
  }
  if (parent.type === "page_id") {
    return { type: "page_id", id: parent.page_id };
  }
  return { type: "workspace", id: null };
}
