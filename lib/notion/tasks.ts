import { getNotionClient, getNotionDatabaseId } from "./client";

export async function createTask(params: {
  accountName: string;
  contactName: string;
  followUpDate: string;
  accountUrl: string;
}) {
  const notion = getNotionClient();
  const databaseId = getNotionDatabaseId();

  const response = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Name: {
        title: [{ text: { content: `Follow up: ${params.accountName}` } }],
      },
      Contact: {
        rich_text: [{ text: { content: params.contactName } }],
      },
      "Follow-Up Date": {
        date: { start: params.followUpDate },
      },
      "Account Link": {
        url: params.accountUrl,
      },
    },
  });

  return response.id;
}

export async function getCompletedTasks(since: string) {
  const notion = getNotionClient();
  const databaseId = getNotionDatabaseId();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (notion.databases as any).query({
    database_id: databaseId,
    filter: {
      and: [
        {
          property: "Status",
          status: { equals: "Done" },
        },
        {
          timestamp: "last_edited_time",
          last_edited_time: { after: since },
        },
      ],
    },
  });

  return response.results;
}
