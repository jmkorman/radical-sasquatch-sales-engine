import { getGmailClient } from "./client";

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  accessToken: string;
}): Promise<string> {
  const gmail = getGmailClient(params.accessToken);

  const message = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    params.body,
  ].join("\n");

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  });

  return response.data.id ?? "";
}
