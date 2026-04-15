import { getGmailClient } from "./client";

export interface ThreadSummary {
  id: string;
  subject: string;
  snippet: string;
  date: string;
}

export async function searchThreadsByEmail(
  email: string,
  accessToken: string
): Promise<ThreadSummary[]> {
  const gmail = getGmailClient(accessToken);

  const response = await gmail.users.threads.list({
    userId: "me",
    q: `from:${email} OR to:${email}`,
    maxResults: 10,
  });

  const threads = response.data.threads ?? [];
  const summaries: ThreadSummary[] = [];

  for (const thread of threads) {
    if (!thread.id) continue;
    const detail = await gmail.users.threads.get({
      userId: "me",
      id: thread.id,
      format: "metadata",
      metadataHeaders: ["Subject", "Date"],
    });

    const headers = detail.data.messages?.[0]?.payload?.headers ?? [];
    const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
    const date = headers.find((h) => h.name === "Date")?.value ?? "";

    summaries.push({
      id: thread.id!,
      subject,
      snippet: detail.data.messages?.[0]?.snippet ?? "",
      date,
    });
  }

  return summaries;
}
