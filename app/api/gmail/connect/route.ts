import { NextResponse } from "next/server";
import { getGmailAuthUrl } from "@/lib/gmail/threads";

export async function GET() {
  const url = getGmailAuthUrl();

  if (!url) {
    return NextResponse.json(
      { error: "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env.local to connect Gmail." },
      { status: 400 }
    );
  }

  return NextResponse.json({ url });
}
