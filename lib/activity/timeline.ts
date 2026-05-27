import { AnyAccount, AllTabsData } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { parseDateFromText } from "@/lib/utils/dates";
import { matchesAccountIdentity, getAccountPrimaryId } from "@/lib/accounts/identity";
import { countsAsContact } from "./helpers";

export function sortActivityLogs(logs: ActivityLog[]): ActivityLog[] {
  return [...logs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function getAllAccounts(data: AllTabsData): AnyAccount[] {
  return [
    ...data.restaurants,
    ...data.retail,
    ...data.catering,
    ...data.foodTruck,
    ...data.activeAccounts,
  ];
}

export function getLogsForAccount(logs: ActivityLog[], account: AnyAccount): ActivityLog[] {
  return sortActivityLogs(logs.filter((log) => matchesAccountIdentity(log, account)));
}

export function getLatestActivityLogForAccount(logs: ActivityLog[], account: AnyAccount): ActivityLog | null {
  return getLogsForAccount(logs, account)[0] ?? null;
}

export function getLatestContactLogForAccount(logs: ActivityLog[], account: AnyAccount): ActivityLog | null {
  return getLogsForAccount(logs, account).find((log) => countsAsContact(log)) ?? null;
}

export function getScheduledFollowUpLogForAccount(logs: ActivityLog[], account: AnyAccount): ActivityLog | null {
  return getLogsForAccount(logs, account)
    .filter((log) => Boolean(log.follow_up_date))
    .sort(
      (a, b) =>
        new Date(a.follow_up_date as string).getTime() -
        new Date(b.follow_up_date as string).getTime()
    )[0] ?? null;
}

/**
 * Single source of truth for "what stage is this account in?"
 *
 * Activity log status wins over the sheet/snapshot because the log is the
 * one writer touched on every email/note/manual change, while the
 * snapshot can drift if an automation only updated one side. Falls back
 * to the snapshot value, then "Identified" if neither has a value.
 *
 * Use this everywhere a UI surface needs to display or group by status
 * (CommandTable rows, StageBoard kanban columns, dashboard rollups).
 */
export function getResolvedAccountStatus(account: AnyAccount, logs: ActivityLog[]): string {
  const latestStatusLog = getLogsForAccount(logs, account).find(
    (log) => log.status_after && log.status_after.trim()
  );
  const fromLog = latestStatusLog?.status_after?.trim();
  if (fromLog) return fromLog;
  if (account.status && account.status.trim()) return account.status;
  return "Identified";
}

export function getResolvedFollowUpDate(account: AnyAccount, logs: ActivityLog[]): string | null {
  const scheduledLog = getScheduledFollowUpLogForAccount(logs, account);
  if (scheduledLog?.follow_up_date) return scheduledLog.follow_up_date;

  const inferred = parseDateFromText(account.nextSteps || "");
  return inferred ? inferred.toISOString() : null;
}

export function buildLatestContactMapByAccount(
  accounts: AnyAccount[],
  logs: ActivityLog[]
): Record<string, ActivityLog> {
  const map: Record<string, ActivityLog> = {};

  for (const account of accounts) {
    const latest = getLatestContactLogForAccount(logs, account);
    if (latest) {
      map[getAccountPrimaryId(account)] = latest;
    }
  }

  return map;
}
