import { AnyAccount, AllTabsData } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { daysSince, parseDateFromText } from "@/lib/utils/dates";
import { getAllAccounts, getLatestContactLogForAccount } from "@/lib/activity/timeline";

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
  const allAccounts: AnyAccount[] = getAllAccounts(data);

  const items: HitListItem[] = [];

  for (const account of allAccounts) {
    // Skip closed accounts and accounts with blank status
    if (account.status === "Closed - Won" || account.status === "") continue;
    if (!account.account) continue;

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

    // Rule 1: Next steps has a date that is due or overdue
    const nextStepsDate = parseDateFromText(account.nextSteps ?? "");
    if (nextStepsDate && nextStepsDate.getTime() <= new Date().setHours(23, 59, 59, 999)) {
      score = 4;
      reason = "Next step is due";
    }
    // Rule 2: Following Up, no touch in 7+ days
    else if (account.status === "Following Up" && daysAgo >= 7) {
      score = 3;
      reason = `Following up - ${daysAgo} days since last touch`;
    }
    // Rule 3: Contacted, no touch in 5+ days
    else if (account.status === "Contacted" && daysAgo >= 5) {
      score = 2;
      reason = `Contacted - ${daysAgo} days since last touch`;
    }
    // Rule 4: Researched, never contacted
    else if (account.status === "Researched" && !lastActivity && !("contactDate" in account && account.contactDate)) {
      score = 1;
      reason = "Researched - no outreach yet";
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
