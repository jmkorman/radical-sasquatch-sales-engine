import { NextRequest, NextResponse } from "next/server";
import { searchThreadsByEmail } from "@/lib/gmail/threads";

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get("email");
    const accessToken = request.nextUrl.searchParams.get("accessToken");

    if (!email || !accessToken) {
      return NextResponse.json({ error: "email and accessToken are required" }, { status: 400 });
    }

    const threads = await searchThreadsByEmail(email, accessToken);
    return NextResponse.json(threads);
  } catch (error) {
    console.error("Gmail threads error:", error);
    return NextResponse.json({ error: "Failed to search threads" }, { status: 500 });
  }
}
