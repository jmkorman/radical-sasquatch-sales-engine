"use client";

import { AnyAccount } from "@/types/accounts";
import { ActivityKind, ActivityLog } from "@/types/activity";
import { getAccountPrimaryId } from "@/lib/accounts/identity";

interface PersistActivityInput {
  account: AnyAccount;
  actionType: string;
  note: string;
  followUpDate?: string | null;
  statusBefore?: string | null;
  statusAfter?: string | null;
  source?: string;
  activityKind?: ActivityKind;
  countsAsContact?: boolean;
  nextActionType?: string | null;
}

export async function persistActivityEntry(input: PersistActivityInput): Promise<ActivityLog> {
  const payload = {
    account_id: getAccountPrimaryId(input.account),
    tab: input.account._tabSlug,
    row_index: input.account._rowIndex,
    account_name: input.account.account,
    action_type: input.actionType,
    note: input.note,
    status_before: input.statusBefore ?? input.account.status ?? null,
    status_after: input.statusAfter ?? input.account.status ?? null,
    follow_up_date: input.followUpDate || null,
    next_action_type: input.nextActionType || null,
    source: input.source ?? (input.actionType === "note" ? "internal" : "manual"),
    activity_kind: input.activityKind ?? (input.actionType === "note" ? "note" : "outreach"),
    counts_as_contact: input.countsAsContact ?? (input.actionType !== "note"),
  };

  const response = await fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to persist activity remotely");
  }

  const log: ActivityLog = await response.json();
  return log;
}
