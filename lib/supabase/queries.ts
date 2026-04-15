import { createServerClient } from "./server";
import { ActivityLog } from "@/types/activity";

export async function insertActivityLog(entry: {
  account_id: string;
  tab: string;
  row_index: number;
  account_name: string;
  action_type: string;
  note?: string;
  status_before?: string;
  status_after?: string;
  follow_up_date?: string;
  notion_task_id?: string;
  source?: string;
}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("activity_logs")
    .insert([{ ...entry, source: entry.source ?? "manual" }])
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
