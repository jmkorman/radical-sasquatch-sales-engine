import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { checkGmailConnectivity } from "@/lib/gmail/sent";
import { logError } from "@/lib/errors/log";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface CheckResult {
  status: "ok" | "not_configured" | "error";
  detail?: string;
}

async function checkSupabase(): Promise<CheckResult> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true });
    if (error) return { status: "error", detail: error.message };
    return { status: "ok" };
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "Unknown Supabase error",
    };
  }
}

function checkSheets(): CheckResult {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !process.env.GOOGLE_SHEET_ID) {
    return { status: "not_configured" };
  }
  return { status: "ok" };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gmail = await checkGmailConnectivity();
  const supabase = await checkSupabase();
  const sheets = checkSheets();

  const checks = {
    gmail: { status: gmail.status, detail: gmail.error ?? gmail.email },
    supabase,
    sheets,
  };

  // Only "error" is unhealthy — "not_configured" is an intentional state.
  const failing = Object.entries(checks).filter(([, c]) => c.status === "error");
  const healthy = failing.length === 0;

  if (!healthy) {
    await logError(
      "cron/health",
      `Health check failing: ${failing.map(([k]) => k).join(", ")}`,
      { checks },
      "warn"
    );
  }

  return NextResponse.json(
    { healthy, checks, ranAt: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
