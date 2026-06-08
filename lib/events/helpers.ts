import {
  BOOKED_EVENT_STATUSES,
  EVENT_STATUSES,
  EventRecord,
  EventStatus,
} from "@/types/events";

// Same 10% commission rate as orders (see lib/commission/calculator.ts).
// Centralized here so an event's commission column can be precomputed at
// write time and revenue surfaces all use the same number.
export const EVENT_COMMISSION_RATE = 0.1;

export function eventRevenueBasis(event: Pick<EventRecord, "actual_amount" | "quoted_amount">): number {
  const actual = typeof event.actual_amount === "number" && Number.isFinite(event.actual_amount)
    ? event.actual_amount
    : null;
  if (actual != null && actual > 0) return actual;
  const quoted = Number.isFinite(event.quoted_amount) ? Number(event.quoted_amount) : 0;
  return quoted;
}

export function calculateEventCommission(event: Pick<EventRecord, "actual_amount" | "quoted_amount" | "status">): number {
  if (event.status === "Cancelled") return 0;
  return eventRevenueBasis(event) * EVENT_COMMISSION_RATE;
}

export function normalizeEventRecord(event: Partial<EventRecord>): EventRecord {
  const now = new Date().toISOString();
  const status = EVENT_STATUSES.includes(event.status as EventStatus)
    ? (event.status as EventStatus)
    : "Inquiry";

  const quoted = Number.isFinite(event.quoted_amount) ? Number(event.quoted_amount) : 0;
  const actual = event.actual_amount != null && Number.isFinite(event.actual_amount)
    ? Number(event.actual_amount)
    : null;
  const deposit = Number.isFinite(event.deposit) ? Number(event.deposit) : 0;

  const precomputed = Number.isFinite(event.commission) ? Number(event.commission) : 0;
  const commission = precomputed > 0
    ? precomputed
    : calculateEventCommission({ actual_amount: actual, quoted_amount: quoted, status });

  return {
    id: event.id ?? "",
    account_id: event.account_id ?? "",
    account_name: event.account_name ?? "",
    tab: event.tab ?? null,
    tab_slug: event.tab_slug ?? null,
    row_index: event.row_index ?? null,
    title: event.title?.trim() ? event.title : "Untitled event",
    event_date: event.event_date ?? now.slice(0, 10),
    event_end_date: event.event_end_date ?? null,
    location: event.location ?? null,
    status,
    quoted_amount: quoted,
    actual_amount: actual,
    deposit,
    deposit_paid: event.deposit_paid ?? false,
    commission,
    contact_name: event.contact_name ?? null,
    phone: event.phone ?? null,
    email: event.email ?? null,
    notes: event.notes ?? null,
    created_at: event.created_at ?? now,
    updated_at: event.updated_at ?? null,
  };
}

export function isBookedRevenueStatus(status: EventStatus): boolean {
  return BOOKED_EVENT_STATUSES.has(status);
}

export interface EventStats {
  count: number;
  upcomingCount: number;
  bookedRevenue: number;
  forecastRevenue: number;
  totalCommission: number;
}

export function getEventStats(events: EventRecord[]): EventStats {
  const todayIso = new Date().toISOString().slice(0, 10);
  let bookedRevenue = 0;
  let forecastRevenue = 0;
  let totalCommission = 0;
  let upcomingCount = 0;

  for (const event of events) {
    if (event.status === "Cancelled") continue;
    const basis = eventRevenueBasis(event);
    if (isBookedRevenueStatus(event.status)) {
      bookedRevenue += basis;
    } else {
      forecastRevenue += basis;
    }
    totalCommission += Number.isFinite(event.commission) ? event.commission : 0;
    if (event.event_date >= todayIso && event.status !== "Completed") {
      upcomingCount += 1;
    }
  }

  return {
    count: events.length,
    upcomingCount,
    bookedRevenue,
    forecastRevenue,
    totalCommission,
  };
}

export function sortEventsByUpcoming(events: EventRecord[]): EventRecord[] {
  const todayIso = new Date().toISOString().slice(0, 10);
  return [...events].sort((a, b) => {
    const aFuture = a.event_date >= todayIso;
    const bFuture = b.event_date >= todayIso;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    // Future events: nearest first. Past events: most recent first.
    if (aFuture) return a.event_date.localeCompare(b.event_date);
    return b.event_date.localeCompare(a.event_date);
  });
}
