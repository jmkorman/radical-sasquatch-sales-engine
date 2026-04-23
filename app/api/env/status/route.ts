import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    googleSheets: Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
    ),
    gmail: Boolean(
      process.env.GMAIL_CLIENT_ID &&
        process.env.GMAIL_CLIENT_SECRET &&
        process.env.GMAIL_REFRESH_TOKEN
    ),
  });
}
