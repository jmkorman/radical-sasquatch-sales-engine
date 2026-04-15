import { NextRequest, NextResponse } from "next/server";
import { insertActivityLog, getActivityLogs } from "@/lib/supabase/queries";

export async function GET(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json([]);
  }
  try {
    const accountId = request.nextUrl.searchParams.get("accountId") ?? undefined;
    const logs = await getActivityLogs(accountId);
    return NextResponse.json(logs);
  } catch (error) {
    console.error("Activity GET error:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  try {
    const body = await request.json();
    const log = await insertActivityLog(body);
    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error("Activity POST error:", error);
    return NextResponse.json({ error: "Failed to insert activity log" }, { status: 500 });
  }
}
