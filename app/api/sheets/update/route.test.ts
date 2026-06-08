// Integration test for /api/sheets/update.
// Focus: the rename-cascade branch (account_id changes when name changes)
// and the same-tab no-rename path (single upsert, no child mutation).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, FakeSupabaseClient } from "@/lib/__tests__/fakeSupabase";
import type { AnyAccount } from "@/types/accounts";

let fake: FakeSupabaseClient;
let currentAccount: AnyAccount;

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => fake,
}));
vi.mock("@/lib/errors/log", () => ({
  logError: vi.fn(async () => undefined),
}));
vi.mock("@/lib/sheets/write", () => ({
  updateCell: vi.fn(async () => undefined),
  deleteRow: vi.fn(async () => undefined),
  getCellValue: vi.fn(async () => ""),
}));
vi.mock("@/lib/accounts/source", () => ({
  getAccountsData: vi.fn(async () => ({
    data: {
      restaurants: [currentAccount],
      retail: [],
      catering: [],
      foodTruck: [],
      activeAccounts: [],
    },
    source: "supabase",
  })),
  findAccountBySheetPosition: vi.fn(async () => ({
    account: currentAccount,
    source: "supabase",
  })),
}));

import { POST } from "@/app/api/sheets/update/route";

const OLD_ID = "restaurants:harmons";
const NEW_ID = "restaurants:harmons-west";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/sheets/update", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  currentAccount = {
    id: OLD_ID,
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

  fake = createFakeSupabase({
    accounts: [
      {
        id: OLD_ID,
        account_name: "Harmons",
        tab: "Restaurants",
        tab_slug: "restaurants",
        row_index: 5,
        raw: {},
      },
    ],
    activity_logs: [
      { id: "l1", account_id: OLD_ID, account_name: "Harmons", is_deleted: false },
      { id: "l2", account_id: OLD_ID, account_name: "Harmons", is_deleted: false },
    ],
    orders: [
      { id: "o1", account_id: OLD_ID, account_name: "Harmons", amount: 100 },
    ],
    events: [
      { id: "e1", account_id: OLD_ID, account_name: "Harmons", status: "Booked", quoted_amount: 500 },
    ],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/sheets/update — rename cascade", () => {
  it("migrates activity_logs, orders, and events to the new id and backfills account_name", async () => {
    const res = await POST(
      makeRequest({ tab: "Restaurants", accountId: OLD_ID, accountName: "Harmons West" })
    );

    expect(res.status).toBe(200);

    expect(fake.state.tables.activity_logs.every((l) => l.account_id === NEW_ID)).toBe(true);
    expect(fake.state.tables.activity_logs.every((l) => l.account_name === "Harmons West")).toBe(true);
    expect(fake.state.tables.orders.every((o) => o.account_id === NEW_ID)).toBe(true);
    expect(fake.state.tables.orders.every((o) => o.account_name === "Harmons West")).toBe(true);
    expect(fake.state.tables.events.every((e) => e.account_id === NEW_ID)).toBe(true);
    expect(fake.state.tables.events.every((e) => e.account_name === "Harmons West")).toBe(true);
  });

  it("leaves no orphan snapshot at the old id after rename", async () => {
    await POST(
      makeRequest({ tab: "Restaurants", accountId: OLD_ID, accountName: "Harmons West" })
    );
    const ids = fake.state.tables.accounts.map((a) => a.id);
    expect(ids).toContain(NEW_ID);
    expect(ids).not.toContain(OLD_ID);
  });

  it("same-tab, same-name save does not migrate any children (single upsert path)", async () => {
    // Only a status change — no rename, no tab change. Children must be untouched.
    const res = await POST(
      makeRequest({
        tab: "Restaurants",
        accountId: OLD_ID,
        newStatus: "Reached Out",
      })
    );

    expect(res.status).toBe(200);
    // All children still pointing at OLD_ID with their original names.
    expect(fake.state.tables.activity_logs.every((l) => l.account_id === OLD_ID)).toBe(true);
    expect(fake.state.tables.activity_logs.every((l) => l.account_name === "Harmons")).toBe(true);
    expect(fake.state.tables.orders.every((o) => o.account_id === OLD_ID)).toBe(true);
    expect(fake.state.tables.events.every((e) => e.account_id === OLD_ID)).toBe(true);
    // Snapshot retains its original id; status was updated in place.
    const snap = fake.state.tables.accounts.find((a) => a.id === OLD_ID);
    expect(snap).toBeTruthy();
    expect(snap?.status).toBe("Reached Out");
  });
});
