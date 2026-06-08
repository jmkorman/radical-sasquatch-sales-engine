// Integration test for /api/accounts/move.
// Stubs out Google Sheets writes and accounts/source so we exercise the
// Supabase cascade in isolation.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, FakeSupabaseClient } from "@/lib/__tests__/fakeSupabase";
import type { AnyAccount } from "@/types/accounts";

let fake: FakeSupabaseClient;
const sourceAccount: AnyAccount = {
  id: "restaurants:harmons",
  account: "Harmons",
  type: "",
  status: "Identified",
  nextSteps: "",
  nextActionType: "",
  contactDate: "",
  contactName: "",
  phone: "",
  email: "",
  notes: "",
  location: "",
  ig: "",
  website: "",
  kitchen: "",
  dumplings: "",
  estMonthlyOrder: "",
  commissionPct: "",
  _tab: "Restaurants",
  _tabSlug: "restaurants",
  _rowIndex: 5,
} as unknown as AnyAccount;

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => fake,
}));
vi.mock("@/lib/errors/log", () => ({
  logError: vi.fn(async () => undefined),
}));
vi.mock("@/lib/sheets/write", () => ({
  appendRow: vi.fn(async () => "Retail!A99:Z99"),
  deleteRow: vi.fn(async () => undefined),
  updateCell: vi.fn(async () => undefined),
  getCellValue: vi.fn(async () => ""),
}));
vi.mock("@/lib/accounts/source", () => ({
  getAccountsData: vi.fn(async () => ({
    data: {
      restaurants: [sourceAccount],
      retail: [],
      catering: [],
      foodTruck: [],
      activeAccounts: [],
    },
    source: "supabase",
  })),
  accountsForTab: (data: unknown, tab: string) => {
    const d = data as Record<string, AnyAccount[]>;
    if (tab === "Restaurants") return d.restaurants;
    if (tab === "Retail") return d.retail;
    return [];
  },
}));

import { POST } from "@/app/api/accounts/move/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/accounts/move", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  fake = createFakeSupabase({
    accounts: [
      {
        id: "restaurants:harmons",
        account_name: "Harmons",
        tab: "Restaurants",
        tab_slug: "restaurants",
        row_index: 5,
        raw: {},
      },
    ],
    activity_logs: [
      { id: "l1", account_id: "restaurants:harmons", tab: "restaurants", is_deleted: false },
    ],
    orders: [
      { id: "o1", account_id: "restaurants:harmons", tab: "restaurants", amount: 100 },
    ],
    events: [
      { id: "e1", account_id: "restaurants:harmons", tab: "restaurants", status: "Booked", quoted_amount: 500 },
    ],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/accounts/move", () => {
  it("migrates orders, events and activity_logs to the new account_id when moving tabs", async () => {
    const res = await POST(
      makeRequest({
        sourceTab: "Restaurants",
        targetTab: "Retail",
        sourceRowIndex: 5,
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.newId).toBe("retail:harmons");
    expect(json.newRowIndex).toBe(99);

    // All children re-pointed at the new id.
    expect(fake.state.tables.orders[0].account_id).toBe("retail:harmons");
    expect(fake.state.tables.events[0].account_id).toBe("retail:harmons");
    expect(fake.state.tables.activity_logs[0].account_id).toBe("retail:harmons");

    // Old snapshot deleted; new snapshot exists.
    const ids = fake.state.tables.accounts.map((a) => a.id);
    expect(ids).toContain("retail:harmons");
    expect(ids).not.toContain("restaurants:harmons");
  });

  it("rejects when source and target tabs match (400)", async () => {
    const res = await POST(
      makeRequest({ sourceTab: "Restaurants", targetTab: "Restaurants", sourceRowIndex: 5 })
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid target tab (400)", async () => {
    const res = await POST(
      makeRequest({ sourceTab: "Restaurants", targetTab: "Bogus", sourceRowIndex: 5 })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the source row is not found", async () => {
    const res = await POST(
      makeRequest({ sourceTab: "Restaurants", targetTab: "Retail", sourceRowIndex: 999 })
    );
    expect(res.status).toBe(404);
  });
});
