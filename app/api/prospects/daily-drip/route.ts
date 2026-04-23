import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/prospecting/shared/auth";
import { runDailyDrip } from "@/lib/prospecting/daily-drip";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDailyDrip();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Daily drip error:", error);
    return NextResponse.json({ error: "Daily drip failed" }, { status: 500 });
  }
}
