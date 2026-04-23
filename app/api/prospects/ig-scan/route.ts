import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/prospecting/shared/auth";
import { runInstagramScan } from "@/lib/prospecting/instagram-scanner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runInstagramScan();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("IG scan error:", error);
    return NextResponse.json({ error: "IG scan failed" }, { status: 500 });
  }
}
