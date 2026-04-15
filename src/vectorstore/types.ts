export interface ChunkMetadata {
  page_id: string;
  page_title: string;
  page_url: string;
  database_id: string;
  heading_path: string;
  chunk_index: number;
  total_chunks: number;
  last_edited_time: string;
  created_time: string;
  content_type: string; // "page" | "database_entry"
}

export interface IndexedChunk {
  id: string; // "{pageId}::{chunkIndex}"
  document: string;
  metadata: ChunkMetadata;
}
