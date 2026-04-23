import { google } from "googleapis";

function getOAuthClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  accessToken?: string;
}): Promise<string> {
  const auth = getOAuthClient();
  if (!auth) throw new Error("Gmail not configured — check GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in .env.local");

  const gmail = google.gmail({ version: "v1", auth });

  const messageParts = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    params.body,
  ];

  const raw = Buffer.from(messageParts.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return res.data.id ?? "";
}
