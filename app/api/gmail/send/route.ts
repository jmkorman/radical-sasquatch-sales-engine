import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/gmail/send";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, subject, body: emailBody, accessToken } = body;

    if (!to || !subject || !emailBody || !accessToken) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const messageId = await sendEmail({ to, subject, body: emailBody, accessToken });
    return NextResponse.json({ messageId });
  } catch (error) {
    console.error("Gmail send error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
