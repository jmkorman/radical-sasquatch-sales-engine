/* eslint-disable @typescript-eslint/no-unused-vars */
export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  accessToken: string;
}): Promise<string> {
  throw new Error("Gmail not configured");
}
