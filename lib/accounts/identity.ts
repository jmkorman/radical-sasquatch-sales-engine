import { AnyAccount } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";

function normalizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeTabId(tab: string): string {
  return normalizeSegment(tab);
}

export function normalizeAccountName(name: string): string {
  return normalizeSegment(name);
}

/**
 * @deprecated Row-index IDs break if rows are added/removed/reordered in the sheet.
 * Kept only for backward-compat matching of old activity log entries.
 * All new IDs must use buildStableAccountId().
 */
function buildLegacyAccountId(tabSlug: string, rowIndex: number): string {
  return `${tabSlug}_${rowIndex}`;
}

export function buildStableAccountId(tab: string, accountName: string): string {
  return `${normalizeTabId(tab)}:${normalizeAccountName(accountName)}`;
}

/** @deprecated Use getAccountPrimaryId() instead. */
function getAccountLegacyId(account: Pick<AnyAccount, "_tabSlug" | "_rowIndex">): string {
  return buildLegacyAccountId(account._tabSlug, account._rowIndex);
}

export function getAccountStableId(account: Pick<AnyAccount, "_tabSlug" | "account">): string {
  return buildStableAccountId(account._tabSlug, account.account);
}

export function getAccountPrimaryId(account: Pick<AnyAccount, "_tabSlug" | "account">): string {
  return getAccountStableId(account);
}

export function getAccountIdAliases(account: Pick<AnyAccount, "_tabSlug" | "_rowIndex" | "account">): string[] {
  return Array.from(new Set([getAccountLegacyId(account), getAccountStableId(account)]));
}

export function getLogStableId(log: Pick<ActivityLog, "tab" | "account_name">): string {
  return buildStableAccountId(log.tab, log.account_name);
}

export function getLogIdAliases(log: Pick<ActivityLog, "account_id" | "tab" | "account_name">): string[] {
  return Array.from(new Set([log.account_id, getLogStableId(log)]));
}

export function matchesAccountIdentity(
  log: Pick<ActivityLog, "account_id" | "tab" | "account_name">,
  account: Pick<AnyAccount, "_tabSlug" | "_rowIndex" | "account">
): boolean {
  const logAliases = new Set(getLogIdAliases(log));
  return getAccountIdAliases(account).some((alias) => logAliases.has(alias));
}
