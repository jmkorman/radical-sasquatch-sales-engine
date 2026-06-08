import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// In-app health probe. Same shape as /api/cron/health but auth-free here
// because:
//   - It's only reachable behind the app_session middleware gate
//   - It's called from the dashboard every 60s and shouldn't require
//     leaking CRON_SECRET into the browser
//
// Returns subsystem-level statuses so the in-app SystemHealthBanner can
// render targeted "Supabase looks down" / "Sheets credentials missing" UI
// without having to call out to the cron route.

export const dynamic = "force-dynamic";

type Status = "ok" | "not_configured" | "error";
interface CheckResult { status: Status; detail?: string }

async function checkSupabase(): Promise<CheckResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { status: "not_configured" };
  }
  try {
    const supabase = createServerClient();
    // Cheapest possible round-trip: HEAD-style count against an always-present table.
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

export async function GET() {
  const supabase = await checkSupabase();
  const sheets = checkSheets();
  return NextResponse.json({
    checks: { supabase, sheets },
    checkedAt: new Date().toISOString(),
  });
}
