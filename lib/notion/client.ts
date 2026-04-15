import { Client } from "@notionhq/client";

let notionClient: Client | null = null;

export function getNotionClient(): Client {
  if (notionClient) return notionClient;
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new Error("NOTION_API_KEY is not set");
  notionClient = new Client({ auth: key });
  return notionClient;
}

export function getNotionDatabaseId(): string {
  const id = process.env.NOTION_DATABASE_ID;
  if (!id) throw new Error("NOTION_DATABASE_ID is not set");
  return id;
}
