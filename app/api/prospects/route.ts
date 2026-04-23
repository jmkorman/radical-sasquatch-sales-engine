import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAccountsData } from "@/lib/accounts/source";
import { getAllAccounts } from "@/lib/accounts/snapshot";
import { normalizeAccountName } from "@/lib/accounts/identity";
import { buildFinderProspects, enrichProspect, getFinderBuckets } from "@/lib/prospecting/finder";
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

function isMissingRelation(error: SupabaseError | null) {
  return error?.code === "42P01" || error?.message?.toLowerCase().includes("could not find the table");
}

const META_PREFIX = "PROSPECT_META:";

function parseMeta(notes?: string | null): Partial<Prospect> {
  if (!notes?.includes(META_PREFIX)) return {};
  const metaLine = notes
    .split("\n")
    .find((line) => line.trim().startsWith(META_PREFIX));
  if (!metaLine) return {};
  try {
    return JSON.parse(metaLine.slice(META_PREFIX.length)) as Partial<Prospect>;
  } catch {
    return {};
  }
}

function cleanNotes(notes?: string | null) {
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

function normalizeProspect(raw: Partial<Prospect>): Prospect {
  const meta = parseMeta(raw.notes);
  return {
    id: raw.id ?? "",
    business_name: raw.business_name ?? "",
    type: raw.type ?? null,
    address: raw.address ?? null,
    website: raw.website ?? null,
    instagram: raw.instagram ?? null,
    notes: cleanNotes(raw.notes),
    source: raw.source ?? "manual",
    added_to_sheet: Boolean(raw.added_to_sheet),
    created_at: raw.created_at ?? new Date().toISOString(),
    channel: raw.channel ?? meta.channel ?? raw.type ?? null,
    status: raw.status ?? meta.status ?? (raw.added_to_sheet ? "approved" : "new"),
    fit_score: raw.fit_score ?? meta.fit_score ?? null,
    confidence_score: raw.confidence_score ?? meta.confidence_score ?? null,
    fit_reason: raw.fit_reason ?? meta.fit_reason ?? null,
    suggested_pitch: raw.suggested_pitch ?? meta.suggested_pitch ?? null,
    source_url: raw.source_url ?? meta.source_url ?? null,
    research_query: raw.research_query ?? meta.research_query ?? null,
    trigger_type: raw.trigger_type ?? meta.trigger_type ?? null,
    trigger_reason: raw.trigger_reason ?? meta.trigger_reason ?? null,
    trigger_date: raw.trigger_date ?? meta.trigger_date ?? null,
    last_enriched_at: raw.last_enriched_at ?? meta.last_enriched_at ?? null,
    duplicate_account_id: raw.duplicate_account_id ?? meta.duplicate_account_id ?? null,
    finder_bucket: raw.finder_bucket ?? meta.finder_bucket ?? null,
    rejected_at: raw.rejected_at ?? meta.rejected_at ?? null,
  };
}

async function insertProspects(payloads: Partial<Prospect>[]) {
  if (payloads.length === 0) return [] as Prospect[];
  const supabase = createServerClient();
  let payload: Record<string, unknown>[] = payloads.map((item) => ({ ...packProspect(item) }));

  while (true) {
    const { data, error } = await supabase
      .from("prospects")
      .insert(payload)
      .select();

    if (!error) return (data ?? []).map((item) => normalizeProspect(item as Partial<Prospect>));
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

async function updateProspect(id: string, updates: Partial<Prospect>) {
  const supabase = createServerClient();
  const existing = await supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .single();
  const base = existing.data ? normalizeProspect(existing.data as Partial<Prospect>) : ({ id } as Prospect);
  const payload: Record<string, unknown> = { ...packProspect({ ...base, ...updates }) };
  delete payload.id;
  delete payload.created_at;

  while (true) {
    const { data, error } = await supabase
      .from("prospects")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (!error) return normalizeProspect(data as Partial<Prospect>);
    const missingColumn = getMissingColumn(error);
    if (missingColumn && missingColumn in payload) {
      delete payload[missingColumn];
      continue;
    }
    throw error;
  }
}

async function getProspects() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .order("created_at", { ascending: false });

  if (isMissingRelation(error)) return [] as Prospect[];
  if (error) throw error;

  const { data: accountData } = await getAccountsData();
  const accounts = getAllAccounts(accountData);
  const accountIdsByName = new Map(accounts.map((account) => [normalizeAccountName(account.account), account.id]));

  return (data ?? []).map((raw) => {
    const prospect = normalizeProspect(raw as Partial<Prospect>);
    return {
      ...prospect,
      duplicate_account_id: prospect.duplicate_account_id ?? accountIdsByName.get(normalizeAccountName(prospect.business_name)) ?? null,
    };
  });
}

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ prospects: [], buckets: getFinderBuckets() });
  }

  try {
    return NextResponse.json({
      prospects: await getProspects(),
      buckets: getFinderBuckets(),
    });
  } catch (error) {
    console.error("Prospects GET error:", error);
    return NextResponse.json({ prospects: [], buckets: getFinderBuckets() });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prospect = enrichProspect({
      business_name: body.business_name ?? "",
      type: body.type ?? null,
      channel: body.channel ?? body.type ?? null,
      address: body.address ?? null,
      website: body.website ?? null,
      instagram: body.instagram ?? null,
      notes: body.notes ?? null,
      source: body.source ?? "manual",
      source_url: body.source_url ?? null,
      research_query: body.research_query ?? null,
      added_to_sheet: false,
      status: "enriched",
    });

    if (!prospect.business_name?.trim()) {
      return NextResponse.json({ error: "business_name is required" }, { status: 400 });
    }

    const inserted = await insertProspects([prospect]);
    return NextResponse.json(inserted[0], { status: 201 });
  } catch (error) {
    console.error("Prospects POST error:", error);
    return NextResponse.json({ error: "Failed to add prospect" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action ?? (body.id ? "approve" : "");

    if (action === "run-finder") {
      const existingProspects = await getProspects();
      const { data } = await getAccountsData();
      const generated = buildFinderProspects(getAllAccounts(data), existingProspects);
      const inserted = await insertProspects(generated);
      return NextResponse.json({
        success: true,
        inserted: inserted.length,
        prospects: inserted,
        buckets: getFinderBuckets(),
      });
    }

    if (action === "enrich-all") {
      const prospects = await getProspects();
      const targets = prospects.filter((prospect) => !prospect.added_to_sheet && prospect.status !== "rejected");
      const updated = await Promise.all(
        targets.map((prospect) =>
          updateProspect(prospect.id, enrichProspect(prospect))
        )
      );
      return NextResponse.json({ success: true, updated: updated.length, prospects: updated });
    }

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (action === "enrich") {
      const prospects = await getProspects();
      const prospect = prospects.find((item) => item.id === body.id);
      if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
      return NextResponse.json(await updateProspect(body.id, enrichProspect(prospect)));
    }

    if (action === "reject") {
      return NextResponse.json(await updateProspect(body.id, {
        status: "rejected",
        rejected_at: new Date().toISOString(),
      }));
    }

    if (action === "reopen") {
      return NextResponse.json(await updateProspect(body.id, {
        status: "new",
        rejected_at: null,
      }));
    }

    const updates = {
      added_to_sheet: true,
      status: "approved",
    } satisfies Partial<Prospect>;

    return NextResponse.json(await updateProspect(body.id, updates));
  } catch (error) {
    console.error("Prospects PUT error:", error);
    return NextResponse.json({ error: "Failed to update prospects" }, { status: 500 });
  }
}
