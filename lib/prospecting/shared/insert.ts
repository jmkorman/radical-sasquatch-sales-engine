import { createServerClient } from "@/lib/supabase/server";
import { Prospect } from "@/types/prospects";

type SupabaseError = { code?: string; message?: string };

const META_PREFIX = "PROSPECT_META:";

function getMissingColumn(error: SupabaseError | null): string | null {
  if (!error || error.code !== "PGRST204" || !error.message) return null;
  const match = error.message.match(/Could not find the '([^']+)' column/);
  return match?.[1] ?? null;
}

function cleanNotes(notes?: string | null): string | null {
  return (notes ?? "")
    .split("\n")
    .filter((line) => !line.trim().startsWith(META_PREFIX))
    .join("\n")
    .trim() || null;
}

function packProspect(payload: Partial<Prospect>) {
  const meta = {
    channel: payload.channel,
    status: payload.status,
    fit_score: payload.fit_score,
    confidence_score: payload.confidence_score,
    fit_reason: payload.fit_reason,
    suggested_pitch: payload.suggested_pitch,
    source_url: payload.source_url,
    research_query: payload.research_query,
    trigger_type: payload.trigger_type,
    trigger_reason: payload.trigger_reason,
    trigger_date: payload.trigger_date,
    last_enriched_at: payload.last_enriched_at,
    duplicate_account_id: payload.duplicate_account_id,
    finder_bucket: payload.finder_bucket,
    rejected_at: payload.rejected_at,
  };
  return {
    ...payload,
    notes: [cleanNotes(payload.notes), `${META_PREFIX}${JSON.stringify(meta)}`].filter(Boolean).join("\n"),
  };
}

export async function insertProspects(payloads: Partial<Prospect>[]): Promise<Prospect[]> {
  if (payloads.length === 0) return [];
  const supabase = createServerClient();
  let payload: Record<string, unknown>[] = payloads.map((item) => ({ ...packProspect(item) }));

  while (true) {
    const { data, error } = await supabase.from("prospects").insert(payload).select();
    if (!error) return (data ?? []) as Prospect[];
    const missingColumn = getMissingColumn(error as SupabaseError);
    if (missingColumn) {
      payload = payload.map((item) => {
        const next = { ...item } as Record<string, unknown>;
        delete next[missingColumn];
        return next;
      });
      continue;
    }
    throw error;
  }
}
