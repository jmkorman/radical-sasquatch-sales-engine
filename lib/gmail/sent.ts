import { google } from "googleapis";

export interface GmailSentMessage {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  body: string;
  from: string;
  to: string;
  date: string;
  internalDate: string;
}

function extractPlainBody(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return "";
  const mimeType = payload.mimeType as string | undefined;
  const body = payload.body as { data?: string } | undefined;
  const parts = payload.parts as Record<string, unknown>[] | undefined;

  if (mimeType === "text/plain" && body?.data) {
    return Buffer.from(body.data, "base64url").toString("utf-8").trim();
  }

  if (parts) {
    for (const part of parts) {
      const text = extractPlainBody(part);
      if (text) return text;
    }
  }

  return "";
}

function getOAuthClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/api/gmail/auth"
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

export async function listRecentSentMessageIds(query: string, maxResults = 50): Promise<string[]> {
  const auth = getOAuthClient();
  if (!auth) return [];

  try {
    const gmail = google.gmail({ version: "v1", auth });
    const res = await gmail.users.messages.list({ userId: "me", q: query, maxResults });
    return res.data.messages?.map((message) => message.id!).filter(Boolean) ?? [];
  } catch (error) {
    console.error("Gmail listRecentSentMessageIds error:", error);
    return [];
  }
}

export async function getSentMessagesById(ids: string[]): Promise<GmailSentMessage[]> {
  if (!ids.length) return [];

  const auth = getOAuthClient();
  if (!auth) return [];

  try {
    const gmail = google.gmail({ version: "v1", auth });
    const details = await Promise.all(
      ids.slice(0, 25).map(async (id) => {
        try {
          const message = await gmail.users.messages.get({
            userId: "me",
            id,
            format: "full",
          });

          const payload = message.data.payload as Record<string, unknown> | undefined;
          const headers = message.data.payload?.headers ?? [];
          const getHeader = (name: string) =>
            headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

          return {
            id,
            threadId: message.data.threadId ?? "",
            subject: getHeader("Subject") || "(no subject)",
            snippet: message.data.snippet ?? "",
            body: extractPlainBody(payload),
            from: getHeader("From"),
            to: getHeader("To"),
            date: getHeader("Date"),
            internalDate: message.data.internalDate ?? "",
          } satisfies GmailSentMessage;
        } catch {
          return null;
        }
      })
    );

    return details.filter(Boolean) as GmailSentMessage[];
  } catch (error) {
    console.error("Gmail getSentMessagesById error:", error);
    return [];
  }
}
