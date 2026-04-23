import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/prospecting/shared/auth";
import { runPermitWatch } from "@/lib/prospecting/permit-watch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPermitWatch();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Permit watch error:", error);
    return NextResponse.json({ error: "Permit watch failed" }, { status: 500 });
  }
}
