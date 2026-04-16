import { createServerClient } from "./server";
import { ActivityLog } from "@/types/activity";
import { OrderRecord } from "@/types/orders";

export async function insertActivityLog(entry: {
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
  source?: string;
  activity_kind?: string;
  counts_as_contact?: boolean;
  created_at?: string;
}) {
  const supabase = createServerClient();
  const payload = { ...entry, source: entry.source ?? "manual" };
  const { data, error } = await supabase
    .from("activity_logs")
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data as ActivityLog;
}

export async function getActivityLogs(accountId?: string): Promise<ActivityLog[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false });

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

export async function updateActivityLog(
  id: string,
  updates: Partial<Pick<ActivityLog, "follow_up_date" | "note" | "status_before" | "status_after">>
) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("activity_logs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ActivityLog;
}

export async function deleteActivityLog(id: string) {
  const supabase = createServerClient();
  const { error } = await supabase.from("activity_logs").delete().eq("id", id);
  if (error) throw error;
}

export async function getLatestActivityByAccount(): Promise<Record<string, ActivityLog>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const map: Record<string, ActivityLog> = {};
  for (const log of (data ?? []) as ActivityLog[]) {
    if (!map[log.account_id]) {
      map[log.account_id] = log;
    }
  }
  return map;
}

export async function getOrders(accountId?: string): Promise<OrderRecord[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("orders")
    .select("*")
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OrderRecord[];
}

export async function insertOrder(entry: {
  account_id: string;
  account_name: string;
  tab: string;
  order_date: string;
  amount: number;
  notes?: string | null;
}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("orders")
    .insert([entry])
    .select()
    .single();

  if (error) throw error;
  return data as OrderRecord;
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
