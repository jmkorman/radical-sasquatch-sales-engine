import { NextRequest, NextResponse } from "next/server";
import { searchThreadsByEmail } from "@/lib/gmail/threads";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    // Check if Gmail is configured
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_REFRESH_TOKEN) {
      return NextResponse.json({ threads: [], configured: false });
    }

    const threads = await searchThreadsByEmail(email);
    return NextResponse.json({ threads, configured: true });
  } catch (error) {
    console.error("Gmail threads error:", error);
    return NextResponse.json({ error: "Failed to search threads" }, { status: 500 });
  }
}
