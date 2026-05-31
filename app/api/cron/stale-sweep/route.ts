import { NextRequest, NextResponse } from "next/server";
import { getAccountsData } from "@/lib/accounts/source";
import { getAllAccounts } from "@/lib/accounts/snapshot";
import { getActivityLogs, updateAccountSnapshot } from "@/lib/supabase/queries";
import { getLatestContactLogForAccount, getResolvedAccountStatus } from "@/lib/activity/timeline";
import { daysSince } from "@/lib/utils/dates";
import { updateCell } from "@/lib/sheets/write";
import { getStatusColumnIndex, getNextStepsColumnIndex } from "@/lib/sheets/schema";
import { CHANNEL_URGENCY_THRESHOLDS } from "@/lib/utils/constants";
import { logError } from "@/lib/errors/log";
import { AnyAccount } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mid-funnel statuses worth nudging. Terminal/closed and brand-new
// "Identified" leads are excluded — we don't nag about untouched cold leads
// or accounts already parked.
const NUDGE_STATUSES = new Set([
  "Reached Out",
  "Connected",
  "Sample Sent",
  "Tasting Complete",
  "Decision Pending",
  "Following Up",
  "Contacted",
]);

const NUDGE_MARKER = "[auto-nudge]";

function canSyncSheets() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.GOOGLE_SHEET_ID);
}

function lastTouchDays(account: AnyAccount, logs: ActivityLog[]): number {
  const latest = getLatestContactLogForAccount(logs, account);
  let lastTouch = latest?.created_at ?? "";
  if (!lastTouch && "contactDate" in account) lastTouch = account.contactDate;
  return daysSince(lastTouch);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data } = await getAccountsData();
    const logs = await getActivityLogs();
    // Pipeline accounts only — Active Accounts are customers tracked separately.
    const accounts = getAllAccounts(data).filter((a) => a._tabSlug !== "active-accounts");

    let backburnered = 0;
    let nudged = 0;
    const moved: string[] = [];

    for (const account of accounts) {
      if (!account.account) continue;
      const status = getResolvedAccountStatus(account, logs);
      if (!NUDGE_STATUSES.has(status)) continue;

      const thresholds =
        CHANNEL_URGENCY_THRESHOLDS[account._tabSlug] ?? CHANNEL_URGENCY_THRESHOLDS.default;
      const days = lastTouchDays(account, logs);
      if (!Number.isFinite(days)) continue;

      // 2× stale → park in Backburner so it stops cluttering the hit list.
      if (days >= thresholds.stale * 2) {
        await updateAccountSnapshot(account.id, { status: "Backburner" }).catch((err) =>
          logError("cron/stale-sweep", err, { accountId: account.id, op: "backburner" }, "warn")
        );
        if (canSyncSheets() && account._rowIndex > 0) {
          await updateCell(
            account._tab,
            account._rowIndex,
            getStatusColumnIndex(account._tab),
            "Backburner"
          ).catch(() => {});
        }
        backburnered++;
        moved.push(`${account.account} → Backburner (${days}d)`);
        continue;
      }

      // 1× stale → prepend a re-engage nudge (idempotent via marker).
      if (days >= thresholds.stale) {
        const existing = (account.nextSteps ?? "").trim();
        if (existing.includes(NUDGE_MARKER)) continue; // already nudged
        const nudgeLine = `${NUDGE_MARKER} 🔥 Re-engage — ${days}d since last contact`;
        const merged = existing ? `${nudgeLine}\n${existing}` : nudgeLine;
        await updateAccountSnapshot(account.id, { next_steps: merged }).catch((err) =>
          logError("cron/stale-sweep", err, { accountId: account.id, op: "nudge" }, "warn")
        );
        if (canSyncSheets() && account._rowIndex > 0) {
          await updateCell(
            account._tab,
            account._rowIndex,
            getNextStepsColumnIndex(account._tab),
            merged
          ).catch(() => {});
        }
        nudged++;
      }
    }

    return NextResponse.json({
      scanned: accounts.length,
      backburnered,
      nudged,
      moved,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    await logError("cron/stale-sweep", error);
    return NextResponse.json({ error: "Stale sweep failed" }, { status: 500 });
  }
}
