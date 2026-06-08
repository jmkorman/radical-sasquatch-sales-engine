import { describe, expect, it } from "vitest";
import {
  calculateEventCommission,
  EVENT_COMMISSION_RATE,
  eventRevenueBasis,
  getEventStats,
  normalizeEventRecord,
  sortEventsByUpcoming,
} from "@/lib/events/helpers";
import type { EventRecord, EventStatus } from "@/types/events";

function ev(overrides: Partial<EventRecord>): EventRecord {
  return normalizeEventRecord({
    id: "test",
    account_id: "a:b",
    account_name: "Test",
    title: "T",
    event_date: "2026-06-10",
    status: "Booked",
    quoted_amount: 0,
    actual_amount: null,
    deposit: 0,
    commission: 0,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  });
}

describe("eventRevenueBasis", () => {
  it("uses actual_amount when present and positive", () => {
    expect(eventRevenueBasis({ actual_amount: 500, quoted_amount: 1000 })).toBe(500);
  });

  it("falls back to quoted_amount when actual is null", () => {
    expect(eventRevenueBasis({ actual_amount: null, quoted_amount: 1000 })).toBe(1000);
  });

  it("falls back to quoted_amount when actual is zero", () => {
    expect(eventRevenueBasis({ actual_amount: 0, quoted_amount: 1000 })).toBe(1000);
  });

  it("returns 0 when neither is set", () => {
    expect(eventRevenueBasis({ actual_amount: null, quoted_amount: 0 })).toBe(0);
  });
});

describe("calculateEventCommission", () => {
  it("is 10% of quoted when actual is missing", () => {
    expect(
      calculateEventCommission({ quoted_amount: 1000, actual_amount: null, status: "Booked" })
    ).toBe(100);
  });

  it("is 10% of actual when actual is present", () => {
    expect(
      calculateEventCommission({ quoted_amount: 1000, actual_amount: 800, status: "Booked" })
    ).toBe(80);
  });

  it("is 0 when status is Cancelled even if amounts are set", () => {
    expect(
      calculateEventCommission({ quoted_amount: 1000, actual_amount: 800, status: "Cancelled" })
    ).toBe(0);
  });

  it("matches the documented EVENT_COMMISSION_RATE constant (10%)", () => {
    expect(EVENT_COMMISSION_RATE).toBe(0.1);
  });
});

describe("getEventStats — rollup rules", () => {
  const events: EventRecord[] = [
    ev({ id: "1", status: "Booked", quoted_amount: 1000, actual_amount: null, commission: 100 }),
    ev({ id: "2", status: "Completed", quoted_amount: 2000, actual_amount: 1800, commission: 180 }),
    ev({ id: "3", status: "Inquiry", quoted_amount: 500, actual_amount: null, commission: 50 }),
    ev({ id: "4", status: "Quoted", quoted_amount: 750, actual_amount: null, commission: 75 }),
    ev({ id: "5", status: "Cancelled", quoted_amount: 9999, actual_amount: 9999, commission: 999 }),
  ];

  it("Booked + Completed feed booked revenue using basis (actual if present, else quoted)", () => {
    const stats = getEventStats(events);
    // 1000 (Booked, quoted) + 1800 (Completed, actual) = 2800
    expect(stats.bookedRevenue).toBe(2800);
  });

  it("Inquiry + Quoted feed forecast revenue (not booked)", () => {
    const stats = getEventStats(events);
    expect(stats.forecastRevenue).toBe(500 + 750);
  });

  it("Cancelled drops from all revenue rollups", () => {
    const stats = getEventStats(events);
    expect(stats.bookedRevenue).not.toContain(9999);
    expect(stats.forecastRevenue).not.toContain(9999);
    // Commission is summed across non-Cancelled. Cancelled commission excluded.
    expect(stats.totalCommission).toBe(100 + 180 + 50 + 75);
  });

  it("count reflects every event including Cancelled", () => {
    expect(getEventStats(events).count).toBe(5);
  });

  it("returns zeroes for an empty list", () => {
    const stats = getEventStats([]);
    expect(stats).toEqual({
      count: 0,
      upcomingCount: 0,
      bookedRevenue: 0,
      forecastRevenue: 0,
      totalCommission: 0,
    });
  });
});

describe("normalizeEventRecord", () => {
  it("coerces unknown status to Inquiry", () => {
    const r = normalizeEventRecord({ status: "Sorta-Booked" as unknown as EventStatus });
    expect(r.status).toBe("Inquiry");
  });

  it("recomputes commission from amounts when precomputed is missing", () => {
    const r = normalizeEventRecord({
      quoted_amount: 1000,
      actual_amount: null,
      status: "Booked",
      commission: 0,
    });
    expect(r.commission).toBe(100);
  });

  it("preserves a non-zero precomputed commission", () => {
    const r = normalizeEventRecord({
      quoted_amount: 1000,
      actual_amount: null,
      status: "Booked",
      commission: 42,
    });
    expect(r.commission).toBe(42);
  });
});

describe("sortEventsByUpcoming", () => {
  it("places future events first (nearest first), then past events (most recent first)", () => {
    const today = new Date().toISOString().slice(0, 10);
    const future1 = new Date(Date.now() + 1 * 86400 * 1000).toISOString().slice(0, 10);
    const future2 = new Date(Date.now() + 10 * 86400 * 1000).toISOString().slice(0, 10);
    const past1 = new Date(Date.now() - 1 * 86400 * 1000).toISOString().slice(0, 10);
    const past2 = new Date(Date.now() - 10 * 86400 * 1000).toISOString().slice(0, 10);

    const ids = sortEventsByUpcoming([
      ev({ id: "p2", event_date: past2 }),
      ev({ id: "f2", event_date: future2 }),
      ev({ id: "p1", event_date: past1 }),
      ev({ id: "f1", event_date: future1 }),
      ev({ id: "today", event_date: today }),
    ]).map((e) => e.id);

    expect(ids[0]).toBe("today"); // today is considered future (>=)
    expect(ids.slice(0, 3)).toEqual(["today", "f1", "f2"]);
    expect(ids.slice(3)).toEqual(["p1", "p2"]);
  });
});
