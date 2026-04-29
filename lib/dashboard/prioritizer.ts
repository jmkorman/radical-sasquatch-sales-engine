import { AnyAccount, AllTabsData } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { daysSince, parseDateFromText } from "@/lib/utils/dates";
import { getLatestContactLogForAccount } from "@/lib/activity/timeline";
import { normalizeAccountName } from "@/lib/accounts/identity";

export interface HitListItem {
  account: AnyAccount;
  score: number;
  reason: string;
  daysSinceLastTouch: number;
  lastActivity: ActivityLog | null;
}

export function buildHitList(
  data: AllTabsData,
  logs: ActivityLog[]
): HitListItem[] {
  // Hit list is for *pipeline* accounts only. Once an account is moved to
  // Active Accounts it's a customer — reorder cadence is tracked separately
  // and we don't want stale follow-up dates from the pipeline tab to keep
  // surfacing it as "overdue".
  const allAccounts: AnyAccount[] = [
    ...data.restaurants,
    ...data.retail,
    ...data.catering,
    ...data.foodTruck,
  ];

  // Active account names — used as a safety net in case a row is mid-migration
  // (still in the source pipeline tab while the new Active row already exists).
  const activeNames = new Set(
    data.activeAccounts
      .map((a) => normalizeAccountName(a.account ?? ""))
      .filter((name) => Boolean(name))
  );

  const items: HitListItem[] = [];

  for (const account of allAccounts) {
    // Skip terminal/closed statuses and blank records
    if (["Closed - Won", "Not a Fit", "Not Interested", ""].includes(account.status)) continue;
    if (!account.account) continue;
    if (activeNames.has(normalizeAccountName(account.account))) continue;

    const lastActivity = getLatestContactLogForAccount(logs, account);

    // Determine days since last touch
    let lastTouchDate = lastActivity?.created_at ?? "";
    if (!lastTouchDate && "contactDate" in account) {
      lastTouchDate = account.contactDate;
    }
    const daysAgo = daysSince(lastTouchDate);

    // Score the account
    let score = 0;
    let reason = "";

    // Rule 1: Follow-up date is due or overdue
    const nextStepsDate = parseDateFromText(account.nextSteps ?? "");
    if (nextStepsDate && nextStepsDate.getTime() <= new Date().setHours(23, 59, 59, 999)) {
      score = 5;
      reason = "Follow-up is due";
    }
    // Rule 2: Decision Pending — these are close to closing, always urgent
    else if (account.status === "Decision Pending" && daysAgo >= 3) {
      score = 5;
      reason = `Decision pending — ${daysAgo}d since last touch`;
    }
    // Rule 3: Tasting Complete — product tried, no order yet, needs close
    else if (account.status === "Tasting Complete" && daysAgo >= 5) {
      score = 4;
      reason = `Tasting done — ${daysAgo}d since follow-up`;
    }
    // Rule 4: Sample Sent — need feedback check-in
    else if (account.status === "Sample Sent" && daysAgo >= 5) {
      score = 4;
      reason = `Sample sent — ${daysAgo}d, check in for feedback`;
    }
    // Rule 5: Connected (active dialogue), going stale
    else if ((account.status === "Connected" || account.status === "Following Up") && daysAgo >= 7) {
      score = 3;
      reason = `Connected — ${daysAgo}d since last touch`;
    }
    // Rule 6: Reached Out / Contacted, waiting for response
    else if ((account.status === "Reached Out" || account.status === "Contacted") && daysAgo >= 5) {
      score = 2;
      reason = `Reached out — ${daysAgo}d, follow up`;
    }
    // Rule 7: Identified/Researched, never contacted
    else if (
      (account.status === "Identified" || account.status === "Researched") &&
      !lastActivity &&
      !("contactDate" in account && account.contactDate)
    ) {
      score = 1;
      reason = "Not yet contacted";
    }

    if (score > 0) {
      items.push({
        account,
        score,
        reason,
        daysSinceLastTouch: daysAgo,
        lastActivity,
      });
    }
  }

  // Sort by score DESC, then by days since last touch DESC (oldest first within same score)
  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.daysSinceLastTouch - a.daysSinceLastTouch;
  });

  return items.slice(0, 20);
}
