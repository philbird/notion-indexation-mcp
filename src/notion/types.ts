export interface NotionPage {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
  createdTime: string;
  parentType: "database_id" | "page_id" | "workspace";
  parentId: string | null;
  archived: boolean;
}

export interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
  description: string;
  properties: Record<string, { type: string; name: string }>;
}

export interface PageContent {
  page: NotionPage;
  markdown: string;
  truncated: boolean;
}
