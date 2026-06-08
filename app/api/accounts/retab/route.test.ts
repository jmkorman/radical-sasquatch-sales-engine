// Integration test for the /api/accounts/retab handler.
// Uses an in-memory fake Supabase so no real DB is touched.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, FakeSupabaseClient } from "@/lib/__tests__/fakeSupabase";

let fake: FakeSupabaseClient;

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => fake,
}));
vi.mock("@/lib/errors/log", () => ({
  logError: vi.fn(async () => undefined),
}));

import { POST } from "@/app/api/accounts/retab/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/accounts/retab", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const OLD_ID = "restaurants:harmons";
const NEW_ID = "retail:harmons";

beforeEach(() => {
  fake = createFakeSupabase({
    accounts: [
      {
        id: OLD_ID,
        account_name: "Harmons",
        tab: "Restaurants",
        tab_slug: "restaurants",
        row_index: 0,
        status: "Identified",
        raw: {},
      },
    ],
    activity_logs: [
      { id: "l1", account_id: OLD_ID, account_name: "Harmons", tab: "restaurants", is_deleted: false },
      { id: "l2", account_id: OLD_ID, account_name: "Harmons", tab: "restaurants", is_deleted: false },
    ],
    orders: [
      { id: "o1", account_id: OLD_ID, account_name: "Harmons", tab: "restaurants", amount: 100 },
    ],
    events: [
      { id: "e1", account_id: OLD_ID, account_name: "Harmons", tab: "restaurants", status: "Booked", quoted_amount: 500 },
    ],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/accounts/retab — cascade", () => {
  it("migrates activity_logs, orders, and events to the new account id", async () => {
    const res = await POST(makeRequest({ accountId: OLD_ID, newTab: "Retail" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.newId).toBe(NEW_ID);

    // Logs point at new id; tab updated to new slug.
    const logs = fake.state.tables.activity_logs;
    expect(logs.every((l) => l.account_id === NEW_ID)).toBe(true);
    expect(logs.every((l) => l.tab === "retail")).toBe(true);

    // Orders + events also follow.
    expect(fake.state.tables.orders.every((o) => o.account_id === NEW_ID)).toBe(true);
    expect(fake.state.tables.events.every((e) => e.account_id === NEW_ID)).toBe(true);
  });

  it("leaves no orphan account snapshot at the old id", async () => {
    await POST(makeRequest({ accountId: OLD_ID, newTab: "Retail" }));

    const ids = fake.state.tables.accounts.map((a) => a.id);
    expect(ids).toContain(NEW_ID);
    expect(ids).not.toContain(OLD_ID);
  });

  it("rejects an unknown target tab with 400", async () => {
    const res = await POST(makeRequest({ accountId: OLD_ID, newTab: "Bogus" }));
    expect(res.status).toBe(400);
    // No mutation happened.
    expect(fake.state.tables.activity_logs.every((l) => l.account_id === OLD_ID)).toBe(true);
  });

  it("returns 'already in tab' (no-op) when the computed new id matches the old id", async () => {
    // Force the no-op path by retabbing to the same tab.
    const res = await POST(makeRequest({ accountId: OLD_ID, newTab: "Restaurants" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newId).toBe(OLD_ID);
    // Children untouched.
    expect(fake.state.tables.activity_logs.every((l) => l.account_id === OLD_ID)).toBe(true);
    expect(fake.state.tables.orders.every((o) => o.account_id === OLD_ID)).toBe(true);
    expect(fake.state.tables.events.every((e) => e.account_id === OLD_ID)).toBe(true);
  });

  it("returns 404 when the account doesn't exist", async () => {
    const res = await POST(makeRequest({ accountId: "ghost:nope", newTab: "Retail" }));
    expect(res.status).toBe(404);
  });
});
