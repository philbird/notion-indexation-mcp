import type { NotionPage } from "../notion/types.js";
import type { IndexedChunk, ChunkMetadata } from "../vectorstore/types.js";

/**
 * Rough token estimate: ~4 characters per token for English text.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Section {
  headingPath: string;
  lines: string[];
}

/**
 * Parse markdown into sections grouped by headings.
 */
function parseIntoSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  const headingStack: string[] = [];
  let currentLines: string[] = [];

  function flushSection(): void {
    if (currentLines.length > 0) {
      sections.push({
        headingPath: headingStack.join(" > "),
        lines: [...currentLines],
      });
      currentLines = [];
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushSection();
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      // Maintain heading stack at correct depth
      while (headingStack.length >= level) {
        headingStack.pop();
      }
      headingStack.push(title);
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }
  flushSection();

  return sections;
}

/**
 * Split a section's text at line boundaries to fit within maxTokens.
 */
function splitSection(
  section: Section,
  maxTokens: number,
): string[][] {
  const groups: string[][] = [];
  let currentGroup: string[] = [];
  let currentTokens = 0;

  for (const line of section.lines) {
    const lineTokens = estimateTokens(line);
    if (currentTokens + lineTokens > maxTokens && currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [];
      currentTokens = 0;
    }
    currentGroup.push(line);
    currentTokens += lineTokens;
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Chunk a page's markdown content into IndexedChunks for embedding.
 *
 * Strategy:
 * 1. Parse markdown into heading-based sections
 * 2. If a section fits within maxTokens, it becomes one chunk
 * 3. If too large, split at line boundaries
 * 4. Each chunk is prefixed with "Page: {title} > {heading path}" for context
 */
export function chunkPageContent(
  page: NotionPage,
  markdown: string,
  maxTokens: number = 512,
): IndexedChunk[] {
  if (!markdown.trim()) {
    return [];
  }

  const sections = parseIntoSections(markdown);
  const chunks: IndexedChunk[] = [];

  const contentType = page.parentType === "database_id" ? "database_entry" : "page";

  for (const section of sections) {
    const sectionText = section.lines.join("\n").trim();
    if (!sectionText) continue;

    const sectionTokens = estimateTokens(sectionText);

    if (sectionTokens <= maxTokens) {
      // Section fits in one chunk
      const prefix = buildPrefix(page.title, section.headingPath);
      chunks.push(buildChunk(prefix + sectionText, page, section.headingPath, chunks.length, contentType));
    } else {
      // Split section into multiple chunks
      const groups = splitSection(section, maxTokens);
      for (const group of groups) {
        const text = group.join("\n").trim();
        if (!text) continue;
        const prefix = buildPrefix(page.title, section.headingPath);
        chunks.push(buildChunk(prefix + text, page, section.headingPath, chunks.length, contentType));
      }
    }
  }

  // Backfill total_chunks
  for (const chunk of chunks) {
    chunk.metadata.total_chunks = chunks.length;
  }

  return chunks;
}

function buildPrefix(pageTitle: string, headingPath: string): string {
  const parts = [pageTitle, headingPath].filter(Boolean);
  return parts.length > 0 ? `[${parts.join(" > ")}]\n\n` : "";
}

function buildChunk(
  document: string,
  page: NotionPage,
  headingPath: string,
  index: number,
  contentType: string,
): IndexedChunk {
  const metadata: ChunkMetadata = {
    page_id: page.id,
    page_title: page.title,
    page_url: page.url,
    database_id: page.parentType === "database_id" ? (page.parentId ?? "") : "",
    heading_path: headingPath,
    chunk_index: index,
    total_chunks: 0, // backfilled after all chunks created
    last_edited_time: page.lastEditedTime,
    created_time: page.createdTime,
    content_type: contentType,
  };

  return {
    id: `${page.id}::${index}`,
    document,
    metadata,
  };
}
