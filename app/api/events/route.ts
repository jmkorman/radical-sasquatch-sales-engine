import { NextRequest, NextResponse } from "next/server";
import {
  deleteEvent,
  getEvents,
  insertEvent,
  updateEvent,
} from "@/lib/events/queries";
import {
  calculateEventCommission,
  normalizeEventRecord,
} from "@/lib/events/helpers";
import { insertActivityLog, deleteActivityLogsForEvent } from "@/lib/supabase/queries";
import { EventRecord, EVENT_STATUSES, EventStatus } from "@/types/events";

export const maxDuration = 30;

function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function configError() {
  return NextResponse.json(
    { error: "Supabase is not configured. Events require a database connection." },
    { status: 503 }
  );
}

function describeError(error: unknown): string {
  if (!error) return "Unknown error";
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object") {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint, e.code ? `(code ${e.code})` : null].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  return String(error);
}

function buildEventActivityNote(event: EventRecord, kind: "created" | "updated"): string {
  const amountSource = event.actual_amount && event.actual_amount > 0
    ? event.actual_amount
    : event.quoted_amount;
  const amount = amountSource
    ? `$${amountSource.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : "";
  const title = event.title || "Untitled event";
  const action = kind === "created" ? "Event logged" : "Event updated";
  // [event-id:UUID] marker mirrors the order timeline marker so a future
  // delete handler can cascade the activity-log entries the same way.
  const idMarker = event.id ? `[event-id:${event.id}]\n` : "";
  const tail = event.event_date ? ` for ${event.event_date}` : "";
  return `${idMarker}${action}: ${title}${tail}${amount ? ` — ${amount}` : ""} (${event.status})`;
}

async function logEventActivity(event: EventRecord, kind: "created" | "updated") {
  if (!event.account_id || !event.tab) return;
  try {
    await insertActivityLog({
      account_id: event.account_id,
      tab: event.tab,
      row_index: event.row_index ?? 0,
      account_name: event.account_name,
      action_type: "note",
      note: buildEventActivityNote(event, kind),
      source: "event",
      activity_kind: "event",
      counts_as_contact: false,
    });
  } catch (error) {
    console.error("Event activity log error:", error);
  }
}

function coerceStatus(value: unknown): EventStatus {
  return EVENT_STATUSES.includes(value as EventStatus)
    ? (value as EventStatus)
    : "Inquiry";
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  if (!supabaseConfigured()) return configError();

  try {
    const accountId = request.nextUrl.searchParams.get("accountId") ?? undefined;
    const accountName = request.nextUrl.searchParams.get("accountName") ?? undefined;
    const events = await getEvents(accountId, accountName);
    return NextResponse.json(events);
  } catch (error) {
    console.error("Events GET error:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  if (!supabaseConfigured()) return configError();

  try {
    const body = await request.json();
    if (!body?.account_id || !body?.account_name || !body?.event_date) {
      return NextResponse.json(
        { error: "account_id, account_name, and event_date are required" },
        { status: 400 }
      );
    }

    const status = coerceStatus(body.status);
    const quoted = toNumber(body.quoted_amount);
    const actual = toOptionalNumber(body.actual_amount);
    const deposit = toNumber(body.deposit);
    const commission = calculateEventCommission({
      quoted_amount: quoted,
      actual_amount: actual,
      status,
    });

    const payload = {
      account_id: String(body.account_id),
      account_name: String(body.account_name),
      tab: body.tab ?? null,
      tab_slug: body.tab_slug ?? null,
      row_index: typeof body.row_index === "number" ? body.row_index : null,
      title: body.title?.trim() ? String(body.title) : "Untitled event",
      event_date: String(body.event_date),
      event_end_date: body.event_end_date || null,
      location: body.location ?? null,
      status,
      quoted_amount: quoted,
      actual_amount: actual,
      deposit,
      deposit_paid: Boolean(body.deposit_paid),
      commission,
      contact_name: body.contact_name ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      notes: body.notes ?? null,
    };

    const inserted = await insertEvent(payload);
    const created = normalizeEventRecord({ ...payload, ...inserted });
    await logEventActivity(created, "created");
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Events POST error:", error);
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!supabaseConfigured()) return configError();

  try {
    const body = await request.json();
    const id = body.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const incoming = (body.updates ?? {}) as Partial<EventRecord>;

    // Recompute commission so revenue surfaces stay consistent on edit.
    const status = incoming.status ? coerceStatus(incoming.status) : undefined;
    const updates: Partial<EventRecord> = { ...incoming };

    if (
      "quoted_amount" in incoming ||
      "actual_amount" in incoming ||
      "status" in incoming
    ) {
      // Fetch current row to fill in unspecified amount fields.
      const current = await updateEvent(id, {}).catch(() => null);
      const quoted = "quoted_amount" in incoming
        ? toNumber(incoming.quoted_amount)
        : current?.quoted_amount ?? 0;
      const actual = "actual_amount" in incoming
        ? toOptionalNumber(incoming.actual_amount)
        : current?.actual_amount ?? null;
      const effectiveStatus = status ?? current?.status ?? "Inquiry";
      updates.quoted_amount = quoted;
      updates.actual_amount = actual;
      updates.status = effectiveStatus;
      updates.commission = calculateEventCommission({
        quoted_amount: quoted,
        actual_amount: actual,
        status: effectiveStatus,
      });
    }

    updates.updated_at = new Date().toISOString();
    const updated = await updateEvent(id, updates);
    await logEventActivity(updated, "updated");
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Events PATCH error:", error);
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!supabaseConfigured()) return configError();

  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await deleteEvent(id);
    // Soft-delete the matching [event-id:UUID] timeline entries so the
    // account log doesn't keep pointing at a now-gone event.
    await deleteActivityLogsForEvent(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Events DELETE error:", error);
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}
