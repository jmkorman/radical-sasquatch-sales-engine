import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAccountsData } from "@/lib/accounts/source";
import { getAllAccounts } from "@/lib/accounts/snapshot";
import { buildFinderProspects } from "@/lib/prospecting/finder";
import { Prospect } from "@/types/prospects";

type SupabaseError = {
  code?: string;
  message?: string;
};

function getMissingColumn(error: SupabaseError | null) {
  if (!error || error.code !== "PGRST204" || !error.message) return null;
  const match = error.message.match(/Could not find the '([^']+)' column/);
  return match?.[1] ?? null;
}

const META_PREFIX = "PROSPECT_META:";

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
  const cleanNotes = (payload.notes ?? "")
    .split("\n")
    .filter((line) => !line.trim().startsWith(META_PREFIX))
    .join("\n")
    .trim();
  return {
    ...payload,
    notes: [cleanNotes, `${META_PREFIX}${JSON.stringify(meta)}`].filter(Boolean).join("\n"),
  };
}

async function getExistingProspects() {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("prospects").select("*");
  if (error) throw error;
  return (data ?? []) as Prospect[];
}

async function insertProspects(payloads: Partial<Prospect>[]) {
  if (payloads.length === 0) return [] as Prospect[];
  const supabase = createServerClient();
  let payload: Record<string, unknown>[] = payloads.map((item) => ({ ...packProspect(item) }));

  while (true) {
    const { data, error } = await supabase.from("prospects").insert(payload).select();
    if (!error) return (data ?? []) as Prospect[];
    const missingColumn = getMissingColumn(error);
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

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const isVercelCron = request.headers.get("user-agent")?.toLowerCase().includes("vercel-cron");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!cronSecret && !isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existingProspects = await getExistingProspects();
    const { data } = await getAccountsData();
    const generated = buildFinderProspects(getAllAccounts(data), existingProspects);
    const inserted = await insertProspects(generated);
    return NextResponse.json({ success: true, inserted: inserted.length, prospects: inserted });
  } catch (error) {
    console.error("Prospect cron run error:", error);
    return NextResponse.json({ error: "Failed to run prospect finder" }, { status: 500 });
  }
}
