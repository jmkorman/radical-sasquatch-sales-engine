import { google } from "googleapis";

export interface GmailThread {
  id: string;
  subject: string;
  snippet: string;
  body: string;
  from: string;
  to: string;
  date: string;
  messageCount: number;
  latestMessageDate: string;
  unread: boolean;
}

// Recursively extract plain-text body from a message payload
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

async function runGmailQuery(query: string): Promise<GmailThread[]> {
  const auth = getOAuthClient();
  if (!auth) return [];

  const gmail = google.gmail({ version: "v1", auth });

  const threadList = await gmail.users.threads.list({
    userId: "me",
    q: query,
    maxResults: 20,
  });

  if (!threadList.data.threads?.length) return [];

  const threadDetails = await Promise.all(
    threadList.data.threads.slice(0, 10).map(async (t) => {
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: t.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "To", "Date"],
      });

      const messages = thread.data.messages ?? [];
      const firstMsg = messages[0];
      const lastMsg = messages[messages.length - 1];

      const getHeader = (msg: typeof firstMsg, name: string) =>
        msg?.payload?.headers?.find(
          (h) => h.name?.toLowerCase() === name.toLowerCase()
        )?.value ?? "";

      const subject = getHeader(firstMsg, "Subject") || "(no subject)";
      const from = getHeader(firstMsg, "From");
      const to = getHeader(firstMsg, "To");
      const date = getHeader(firstMsg, "Date");
      const latestDate = getHeader(lastMsg, "Date");

      const isUnread = messages.some((m) => m.labelIds?.includes("UNREAD"));

      return {
        id: t.id!,
        subject,
        snippet: thread.data.snippet ?? "",
        from,
        to,
        date,
        messageCount: messages.length,
        latestMessageDate: latestDate || date,
        unread: isUnread,
      } as GmailThread;
    })
  );

  return threadDetails.sort(
    (a, b) =>
      new Date(b.latestMessageDate).getTime() -
      new Date(a.latestMessageDate).getTime()
  );
}

// Efficiently lists thread IDs matching a query without fetching full message data
export async function listRecentThreadIds(query: string, maxResults = 50): Promise<string[]> {
  const auth = getOAuthClient();
  if (!auth) return [];
  try {
    const gmail = google.gmail({ version: "v1", auth });
    const res = await gmail.users.threads.list({ userId: "me", q: query, maxResults });
    return res.data.threads?.map((t) => t.id!).filter(Boolean) ?? [];
  } catch (error) {
    console.error("Gmail listRecentThreadIds error:", error);
    return [];
  }
}

// Fetches full thread details (including body) for specific thread IDs
export async function getThreadDetailsById(ids: string[]): Promise<GmailThread[]> {
  if (!ids.length) return [];
  const auth = getOAuthClient();
  if (!auth) return [];
  try {
    const gmail = google.gmail({ version: "v1", auth });
    const details = await Promise.all(
      ids.slice(0, 25).map(async (id) => {
        try {
          const thread = await gmail.users.threads.get({
            userId: "me",
            id,
            format: "full",
          });
          const messages = thread.data.messages ?? [];
          const firstMsg = messages[0];
          const lastMsg = messages[messages.length - 1];
          const getHeader = (msg: typeof firstMsg, name: string) =>
            msg?.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
          const body = extractPlainBody(firstMsg?.payload as Record<string, unknown> | undefined);
          return {
            id,
            subject: getHeader(firstMsg, "Subject") || "(no subject)",
            snippet: thread.data.snippet ?? "",
            body,
            from: getHeader(firstMsg, "From"),
            to: getHeader(firstMsg, "To"),
            date: getHeader(firstMsg, "Date"),
            messageCount: messages.length,
            latestMessageDate: getHeader(lastMsg, "Date") || getHeader(firstMsg, "Date"),
            unread: messages.some((m) => m.labelIds?.includes("UNREAD")),
          } as GmailThread;
        } catch {
          return null;
        }
      })
    );
    return details.filter(Boolean) as GmailThread[];
  } catch (error) {
    console.error("Gmail getThreadDetailsById error:", error);
    return [];
  }
}

export async function searchThreadsByEmail(
  email: string,
  options?: { since?: string }
): Promise<GmailThread[]> {
  try {
    let query = `from:${email} OR to:${email}`;
    if (options?.since) query += ` after:${options.since}`;
    return await runGmailQuery(query);
  } catch (error) {
    console.error("Gmail thread fetch error:", error);
    return [];
  }
}

export async function searchThreadsByQuery(query: string): Promise<GmailThread[]> {
  try {
    return await runGmailQuery(query);
  } catch (error) {
    console.error("Gmail thread query error:", error);
    return [];
  }
}

export function getGmailAuthUrl(): string | null {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/api/gmail/auth";

  if (!clientId || !clientSecret) return null;

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
}

export async function exchangeCodeForTokens(code: string): Promise<{
  refresh_token: string | null;
  access_token: string | null;
} | null> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/api/gmail/auth";

  if (!clientId || !clientSecret) return null;

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const { tokens } = await oauth2Client.getToken(code);
  return {
    refresh_token: tokens.refresh_token ?? null,
    access_token: tokens.access_token ?? null,
  };
}
