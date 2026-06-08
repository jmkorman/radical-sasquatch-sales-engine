import { createServerClient } from "@/lib/supabase/server";
import { EventRecord } from "@/types/events";
import { normalizeEventRecord } from "./helpers";

function getMissingColumn(error: { code?: string; message?: string } | null) {
  if (!error || error.code !== "PGRST204" || !error.message) return null;
  const match = error.message.match(/Could not find the '([^']+)' column/);
  return match?.[1] ?? null;
}

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    error?.message?.toLowerCase().includes("could not find the table")
  );
}

export async function getEvents(
  accountId?: string,
  accountName?: string
): Promise<EventRecord[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("events")
    .select("*")
    .order("event_date", { ascending: true })
    .order("created_at", { ascending: false });

  // Mirror getOrders: when both id and name are supplied, OR them so
  // events whose account_id has drifted (rename/retab) still resolve by name.
  if (accountId && accountName) {
    query = query.or(`account_id.eq.${accountId},account_name.eq.${accountName}`);
  } else if (accountId) {
    query = query.eq("account_id", accountId);
  } else if (accountName) {
    query = query.eq("account_name", accountName);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => normalizeEventRecord(row as Partial<EventRecord>));
}

export async function insertEvent(
  entry: Partial<EventRecord> & {
    account_id: string;
    account_name: string;
    event_date: string;
  }
): Promise<EventRecord> {
  const supabase = createServerClient();
  let payload: Record<string, unknown> = { ...entry };

  // Column-missing retry: tolerate a Supabase schema that doesn't yet have
  // every column (same pattern as insertActivityLog/insertOrder).
  while (true) {
    const { data, error } = await supabase
      .from("events")
      .insert([payload])
      .select()
      .single();

    if (!error) return normalizeEventRecord(data as Partial<EventRecord>);

    if (isMissingRelation(error)) {
      throw new Error(
        "Supabase 'events' table is missing. Run supabase/events.sql against your database to create it."
      );
    }

    const missingColumn = getMissingColumn(error);
    if (missingColumn && missingColumn in payload) {
      const next = { ...payload };
      delete next[missingColumn];
      payload = next;
      continue;
    }

    throw error;
  }
}

export async function updateEvent(
  id: string,
  updates: Partial<Omit<EventRecord, "id" | "created_at">>
): Promise<EventRecord> {
  const supabase = createServerClient();
  let payload: Record<string, unknown> = { ...updates };

  while (true) {
    if (Object.keys(payload).length === 0) {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return normalizeEventRecord(data as Partial<EventRecord>);
    }

    const { data, error } = await supabase
      .from("events")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (!error) return normalizeEventRecord(data as Partial<EventRecord>);

    if (isMissingRelation(error)) {
      throw new Error(
        "Supabase 'events' table is missing. Run supabase/events.sql against your database to create it."
      );
    }

    const missingColumn = getMissingColumn(error);
    if (missingColumn && missingColumn in payload) {
      const next = { ...payload };
      delete next[missingColumn];
      payload = next;
      continue;
    }

    throw error;
  }
}

export async function deleteEvent(id: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error && !isMissingRelation(error)) throw error;
}
