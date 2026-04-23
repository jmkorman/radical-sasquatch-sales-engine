import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/prospecting/shared/auth";
import { runJobScan } from "@/lib/prospecting/job-scanner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runJobScan();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Job scan error:", error);
    return NextResponse.json({ error: "Job scan failed" }, { status: 500 });
  }
}
