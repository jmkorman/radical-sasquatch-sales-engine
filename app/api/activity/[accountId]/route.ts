import { NextRequest, NextResponse } from "next/server";
import { getActivityLogs } from "@/lib/supabase/queries";

export async function GET(
  request: NextRequest,
  { params }: { params: { accountId: string } }
) {
  try {
    const logs = await getActivityLogs(params.accountId);
    return NextResponse.json(logs);
  } catch (error) {
    console.error("Activity GET error:", error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
