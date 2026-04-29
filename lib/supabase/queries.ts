import { createServerClient } from "./server";
import { ActivityLog } from "@/types/activity";
import { OrderRecord } from "@/types/orders";
import { normalizeOrderRecord } from "@/lib/orders/helpers";
import { AccountSnapshot } from "@/lib/accounts/snapshot";

function normalizeActivityLog(log: Partial<ActivityLog>): ActivityLog {
  return {
    id: log.id ?? "",
    account_id: log.account_id ?? "",
    tab: log.tab ?? "",
    row_index: log.row_index ?? 0,
    account_name: log.account_name ?? "",
    action_type: (log.action_type ?? "note") as ActivityLog["action_type"],
    note: log.note ?? null,
    status_before: log.status_before ?? null,
    status_after: log.status_after ?? null,
    follow_up_date: log.follow_up_date ?? null,
    notion_task_id: log.notion_task_id ?? null,
    next_action_type: log.next_action_type ?? null,
    source: log.source ?? "manual",
    created_at: log.created_at ?? new Date().toISOString(),
    activity_kind:
      log.activity_kind ??
      ((log.action_type ?? "note") === "note" ? "note" : "outreach"),
    counts_as_contact:
      log.counts_as_contact ?? ((log.action_type ?? "note") !== "note"),
    is_deleted: log.is_deleted ?? false,
  };
}

function getMissingColumn(error: { code?: string; message?: string } | null) {
  if (!error || error.code !== "PGRST204" || !error.message) return null;
  const match = error.message.match(/Could not find the '([^']+)' column/);
  return match?.[1] ?? null;
}

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.message?.toLowerCase().includes("could not find the table");
}

export async function upsertAccountSnapshots(accounts: AccountSnapshot[]): Promise<boolean> {
  if (accounts.length === 0) return true;
  const dedupedAccounts = Array.from(
    accounts.reduce((map, account) => map.set(account.id, account), new Map<string, AccountSnapshot>()).values()
  );
  const supabase = createServerClient();
  const { error } = await supabase
    .from("accounts")
    .upsert(dedupedAccounts, { onConflict: "id" });

  if (isMissingRelation(error)) {
    console.warn("Supabase accounts table is missing. Run supabase/accounts.sql to enable account source-of-truth sync.");
    return false;
  }

  if (error) throw error;
  return true;
}

export async function upsertAccountSnapshot(account: AccountSnapshot): Promise<boolean> {
  return upsertAccountSnapshots([account]);
}

export async function getAccountSnapshots(): Promise<AccountSnapshot[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("account_name", { ascending: true });

  if (isMissingRelation(error)) return [];
  if (error) throw error;
  return (data ?? []) as AccountSnapshot[];
}

export async function updateAccountSnapshot(
  id: string,
  updates: Partial<Omit<AccountSnapshot, "id">>
): Promise<AccountSnapshot | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("accounts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (isMissingRelation(error)) return null;
  if (error) throw error;
  return data as AccountSnapshot;
}

export async function deleteAccountSnapshot(id: string): Promise<boolean> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", id);

  if (isMissingRelation(error)) return false;
  if (error) throw error;
  return true;
}

export async function insertActivityLog(entry: {
  id?: string;
  account_id: string;
  tab: string;
  row_index: number;
  account_name: string;
  action_type: string;
  note?: string | null;
  status_before?: string | null;
  status_after?: string | null;
  follow_up_date?: string | null;
  notion_task_id?: string | null;
  next_action_type?: string | null;
  source?: string;
  activity_kind?: string;
  counts_as_contact?: boolean;
  created_at?: string;
}) {
  const supabase = createServerClient();
  let payload: Record<string, unknown> = { ...entry, source: entry.source ?? "manual" };

  while (true) {
    const { data, error } = await supabase
      .from("activity_logs")
      .insert([payload])
      .select()
      .single();

    if (!error) {
      const inserted = normalizeActivityLog(data as Partial<ActivityLog>);
      if (shouldReplaceAccountFollowUp(entry, inserted)) {
        await clearOtherFollowUpDates(inserted, inserted.id);
      }
      return inserted;
    }

    if (entry.id && error.code === "23505") {
      const { data: existing, error: existingError } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("id", entry.id)
        .single();

      if (!existingError && existing) {
        return normalizeActivityLog(existing as Partial<ActivityLog>);
      }
    }

    const missingColumn = getMissingColumn(error);
    if (missingColumn && missingColumn in payload) {
      const nextPayload = { ...payload };
      delete nextPayload[missingColumn];
      payload = nextPayload;
      continue;
    }

    throw error;
  }
}

function shouldReplaceAccountFollowUp(
  entry: {
    action_type: string;
    follow_up_date?: string | null;
    activity_kind?: string;
    counts_as_contact?: boolean;
  },
  inserted: ActivityLog
) {
  if (!inserted.account_id) return false;
  if (entry.action_type === "note" || entry.activity_kind === "note") return false;
  return entry.counts_as_contact ?? true;
}

export async function clearOtherFollowUpDates(
  log: Pick<ActivityLog, "account_id" | "tab" | "row_index" | "account_name">,
  keepLogId?: string | null
) {
  const supabase = createServerClient();

  async function clearByAccountId(accountId: string) {
    if (!accountId) return;
    let query = supabase
      .from("activity_logs")
      .update({ follow_up_date: null })
      .eq("account_id", accountId);

    if (keepLogId) query = query.neq("id", keepLogId);

    const { error } = await query;
    if (error) throw error;
  }

  await clearByAccountId(log.account_id);

  if (log.tab && log.row_index) {
    await clearByAccountId(`${log.tab}_${log.row_index}`);
  }

  if (log.tab && log.account_name) {
    let query = supabase
      .from("activity_logs")
      .update({ follow_up_date: null })
      .eq("tab", log.tab)
      .eq("account_name", log.account_name);

    if (keepLogId) query = query.neq("id", keepLogId);

    const { error } = await query;
    if (error) throw error;
  }
}

export async function getActivityLogs(accountId?: string): Promise<ActivityLog[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("activity_logs")
    .select("*")
    .not("is_deleted", "eq", true)
    .order("created_at", { ascending: false });

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((log) => normalizeActivityLog(log as Partial<ActivityLog>));
}

export async function getDeletedActivityLogs(accountId?: string): Promise<ActivityLog[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("activity_logs")
    .select("*")
    .eq("is_deleted", true)
    .order("created_at", { ascending: false });

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((log) => normalizeActivityLog(log as Partial<ActivityLog>));
}

export async function updateActivityLog(
  id: string,
  updates: Partial<Pick<ActivityLog, "action_type" | "note" | "status_before" | "status_after" | "follow_up_date" | "next_action_type" | "source" | "activity_kind" | "counts_as_contact" | "is_deleted">>
) {
  const supabase = createServerClient();
  let payload: Record<string, unknown> = { ...updates };

  while (true) {
    const { data, error } = await supabase
      .from("activity_logs")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (!error) {
      const updated = normalizeActivityLog(data as Partial<ActivityLog>);
      if (updates.follow_up_date && updated.account_id) {
        // Don't let cleanup failure block the save — follow_up_date is already written.
        await clearOtherFollowUpDates(updated, updated.id).catch(() => {});
      }
      return updated;
    }

    const missingColumn = getMissingColumn(error);
    if (missingColumn && missingColumn in payload) {
      const nextPayload = { ...payload };
      delete nextPayload[missingColumn];
      payload = nextPayload;
      continue;
    }

    throw error;
  }
}

export async function deleteActivityLog(id: string) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("activity_logs")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreActivityLog(id: string) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("activity_logs")
    .update({ is_deleted: false })
    .eq("id", id);
  if (error) throw error;
}

export async function getLatestActivityByAccount(): Promise<Record<string, ActivityLog>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .not("is_deleted", "eq", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const map: Record<string, ActivityLog> = {};
  for (const rawLog of data ?? []) {
    const log = normalizeActivityLog(rawLog as Partial<ActivityLog>);
    if (!map[log.account_id]) {
      map[log.account_id] = log;
    }
  }
  return map;
}

export async function getOrders(accountId?: string, accountName?: string): Promise<OrderRecord[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("orders")
    .select("*")
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });

  // When both accountId and accountName are supplied, match either —
  // recovers orphan orders whose account_id is stale because the account
  // was moved between tabs (which rebuilds the stable id).
  if (accountId && accountName) {
    query = query.or(`account_id.eq.${accountId},account_name.eq.${accountName}`);
  } else if (accountId) {
    query = query.eq("account_id", accountId);
  } else if (accountName) {
    query = query.eq("account_name", accountName);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((order) => normalizeOrderRecord(order as Partial<OrderRecord>));
}

export async function insertOrder(entry: Partial<OrderRecord> & {
  account_id: string;
  account_name: string;
  tab: string;
  order_date: string;
}) {
  const supabase = createServerClient();

  let payload: Record<string, unknown> = { ...entry };

  while (true) {
    const { data, error } = await supabase
      .from("orders")
      .insert([payload])
      .select()
      .single();

    if (!error) return normalizeOrderRecord(data as Partial<OrderRecord>);

    const missingColumn = getMissingColumn(error);
    if (missingColumn && missingColumn in payload) {
      const nextPayload = { ...payload };
      delete nextPayload[missingColumn];
      payload = nextPayload;
      continue;
    }

    throw error;
  }
}

export async function updateOrder(
  id: string,
  updates: Partial<Omit<OrderRecord, "id" | "created_at">>
) {
  const supabase = createServerClient();
  let payload: Record<string, unknown> = { ...updates };

  while (true) {
    if (Object.keys(payload).length === 0) {
      const { data, error } = await supabase.from("orders").select("*").eq("id", id).single();
      if (error) throw error;
      return normalizeOrderRecord(data as Partial<OrderRecord>);
    }

    const { data, error } = await supabase
      .from("orders")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (!error) return normalizeOrderRecord(data as Partial<OrderRecord>);

    const missingColumn = getMissingColumn(error);
    if (missingColumn && missingColumn in payload) {
      const nextPayload = { ...payload };
      delete nextPayload[missingColumn];
      payload = nextPayload;
      continue;
    }

    throw error;
  }
}

export async function deleteOrder(id: string) {
  const supabase = createServerClient();
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteResearchImportLogs(createdAt: string) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("activity_logs")
    .delete()
    .eq("source", "research")
    .eq("created_at", createdAt);

  if (error) throw error;
}

export async function getAppSetting(key: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value ?? null;
}

export async function upsertAppSetting(key: string, value: string) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}
