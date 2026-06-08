// Tests for cascade behavior in lib/supabase/queries.ts.
// Uses an in-memory fake Supabase client so no real DB is touched.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, FakeSupabaseClient } from "@/lib/__tests__/fakeSupabase";

let fake: FakeSupabaseClient;

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => fake,
}));

import {
  cascadeDeleteAccount,
  deleteActivityLogsForOrder,
  deleteActivityLogsForEvent,
} from "@/lib/supabase/queries";

beforeEach(() => {
  fake = createFakeSupabase({
    accounts: [
      { id: "restaurants:harmons", account_name: "Harmons", tab: "Restaurants" },
      { id: "retail:wholefoods", account_name: "Whole Foods", tab: "Retail" },
    ],
    orders: [
      { id: "o1", account_id: "restaurants:harmons", account_name: "Harmons", amount: 100, status: "New" },
      { id: "o2", account_id: "restaurants:harmons", account_name: "Harmons", amount: 200, status: "New" },
      { id: "o3", account_id: "retail:wholefoods", account_name: "Whole Foods", amount: 50, status: "New" },
    ],
    events: [
      { id: "e1", account_id: "restaurants:harmons", account_name: "Harmons", status: "Booked", quoted_amount: 500 },
      { id: "e2", account_id: "retail:wholefoods", account_name: "Whole Foods", status: "Booked", quoted_amount: 1000 },
    ],
    activity_logs: [
      { id: "l1", account_id: "restaurants:harmons", note: "called", is_deleted: false, source: "manual" },
      { id: "l2", account_id: "restaurants:harmons", note: "emailed", is_deleted: false, source: "manual" },
      { id: "l3", account_id: "retail:wholefoods", note: "noted", is_deleted: false, source: "manual" },
      { id: "l4", account_id: "restaurants:harmons", note: "Order updated: [order-id:o1]", is_deleted: false, source: "order" },
      { id: "l5", account_id: "restaurants:harmons", note: "Order updated: [order-id:o2]", is_deleted: false, source: "order" },
      { id: "l6", account_id: "retail:wholefoods", note: "Order updated: [order-id:o3]", is_deleted: false, source: "order" },
      { id: "l8", account_id: "restaurants:harmons", note: "[event-id:e1]\nEvent logged: Tasting", is_deleted: false, source: "event" },
      { id: "l9", account_id: "restaurants:harmons", note: "[event-id:e1]\nEvent updated: Tasting", is_deleted: false, source: "event" },
      { id: "l10", account_id: "retail:wholefoods", note: "[event-id:e2]\nEvent logged: Pop-up", is_deleted: false, source: "event" },
    ],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("cascadeDeleteAccount", () => {
  it("hard-deletes the account's orders and events but leaves other accounts untouched", async () => {
    await cascadeDeleteAccount("restaurants:harmons");

    expect(fake.state.tables.orders.map((o) => o.id)).toEqual(["o3"]);
    expect(fake.state.tables.events.map((e) => e.id)).toEqual(["e2"]);
  });

  it("soft-deletes activity logs (preserves audit trail)", async () => {
    await cascadeDeleteAccount("restaurants:harmons");

    const logs = fake.state.tables.activity_logs;
    const targetLogs = logs.filter((l) => l.account_id === "restaurants:harmons");
    expect(targetLogs).toHaveLength(6);
    for (const l of targetLogs) {
      expect(l.is_deleted).toBe(true);
    }
    // Untouched account's logs stay live.
    const otherLog = logs.find((l) => l.id === "l3");
    expect(otherLog?.is_deleted).toBe(false);
  });

  it("removes the account snapshot row", async () => {
    await cascadeDeleteAccount("restaurants:harmons");
    expect(fake.state.tables.accounts.map((a) => a.id)).toEqual(["retail:wholefoods"]);
  });

  it("is a no-op for an empty accountId", async () => {
    await cascadeDeleteAccount("");
    expect(fake.state.tables.accounts).toHaveLength(2);
    expect(fake.state.tables.orders).toHaveLength(3);
    expect(fake.state.tables.events).toHaveLength(2);
  });

  it("tolerates missing tables without throwing", async () => {
    fake.state.missingTables.add("events");
    fake.state.missingTables.add("orders");
    await expect(
      cascadeDeleteAccount("restaurants:harmons")
    ).resolves.toBeUndefined();
    // Snapshot delete still attempted.
    expect(fake.state.tables.accounts.map((a) => a.id)).toEqual(["retail:wholefoods"]);
  });
});

describe("deleteActivityLogsForOrder", () => {
  it("soft-deletes only activity_logs whose note contains the order id marker AND source=order", async () => {
    await deleteActivityLogsForOrder("o1");

    const logs = fake.state.tables.activity_logs;
    const l4 = logs.find((l) => l.id === "l4");
    const l5 = logs.find((l) => l.id === "l5");
    const l6 = logs.find((l) => l.id === "l6");
    expect(l4?.is_deleted).toBe(true);
    expect(l5?.is_deleted).toBe(false);
    expect(l6?.is_deleted).toBe(false);
  });

  it("ignores logs whose source is not 'order' even if they contain the marker", async () => {
    fake.state.tables.activity_logs.push({
      id: "l7",
      account_id: "restaurants:harmons",
      note: "note about [order-id:o1] randomly",
      is_deleted: false,
      source: "manual",
    });
    await deleteActivityLogsForOrder("o1");

    const l7 = fake.state.tables.activity_logs.find((l) => l.id === "l7");
    expect(l7?.is_deleted).toBe(false);
  });

  it("is a no-op for an empty order id", async () => {
    await deleteActivityLogsForOrder("");
    expect(
      fake.state.tables.activity_logs.every((l) => l.is_deleted === false)
    ).toBe(true);
  });
});

describe("deleteActivityLogsForEvent", () => {
  it("soft-deletes only activity_logs whose note contains the event id marker AND source=event", async () => {
    await deleteActivityLogsForEvent("e1");

    const logs = fake.state.tables.activity_logs;
    expect(logs.find((l) => l.id === "l8")?.is_deleted).toBe(true);
    expect(logs.find((l) => l.id === "l9")?.is_deleted).toBe(true);
    // Different event id stays live.
    expect(logs.find((l) => l.id === "l10")?.is_deleted).toBe(false);
    // Order/manual logs untouched.
    expect(logs.find((l) => l.id === "l1")?.is_deleted).toBe(false);
    expect(logs.find((l) => l.id === "l4")?.is_deleted).toBe(false);
  });

  it("ignores logs whose source is not 'event' even if they contain the marker", async () => {
    fake.state.tables.activity_logs.push({
      id: "lX",
      account_id: "restaurants:harmons",
      note: "manual mention of [event-id:e1]",
      is_deleted: false,
      source: "manual",
    });
    await deleteActivityLogsForEvent("e1");
    const lX = fake.state.tables.activity_logs.find((l) => l.id === "lX");
    expect(lX?.is_deleted).toBe(false);
  });

  it("is a no-op for an empty event id", async () => {
    await deleteActivityLogsForEvent("");
    expect(
      fake.state.tables.activity_logs.every((l) => l.is_deleted === false)
    ).toBe(true);
  });
});
