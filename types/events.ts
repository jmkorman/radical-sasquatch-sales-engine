// Event statuses are intentionally separate from pipeline STATUS_VALUES —
// see ENGINE_AUDIT.md Section 9: "reusing pipeline STATUS_VALUES would
// pollute account scoring/stale-sweep logic."
export const EVENT_STATUSES = [
  "Inquiry",
  "Quoted",
  "Booked",
  "Completed",
  "Cancelled",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

// Statuses that count toward booked revenue / commission rollups.
// "Inquiry" and "Quoted" are forecast only; "Cancelled" never counts.
export const BOOKED_EVENT_STATUSES: ReadonlySet<EventStatus> = new Set([
  "Booked",
  "Completed",
]);

export interface EventRecord {
  id: string;
  account_id: string;
  account_name: string;
  tab?: string | null;
  tab_slug?: string | null;
  row_index?: number | null;
  title: string;
  event_date: string;
  event_end_date?: string | null;
  location?: string | null;
  status: EventStatus;
  quoted_amount: number;
  actual_amount?: number | null;
  deposit: number;
  deposit_paid?: boolean | null;
  commission: number;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
}
