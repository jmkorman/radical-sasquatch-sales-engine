// Integration test for /api/events DELETE.
// Verifies that deleting an event also soft-deletes the [event-id:UUID]
// activity-log entries (Step 4 from the overnight task list).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, FakeSupabaseClient } from "@/lib/__tests__/fakeSupabase";

let fake: FakeSupabaseClient;

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => fake,
}));

// /api/events keys off NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
// to decide whether Supabase is "configured". The test environment is unlikely
// to have these set, so stub them here and restore on teardown.
const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  fake = createFakeSupabase({
    events: [
      { id: "e1", account_id: "restaurants:harmons", account_name: "Harmons", status: "Booked", quoted_amount: 500 },
      { id: "e2", account_id: "restaurants:harmons", account_name: "Harmons", status: "Inquiry", quoted_amount: 200 },
    ],
    activity_logs: [
      { id: "l1", account_id: "restaurants:harmons", note: "[event-id:e1]\nEvent logged: Tasting", is_deleted: false, source: "event" },
      { id: "l2", account_id: "restaurants:harmons", note: "[event-id:e1]\nEvent updated: Tasting", is_deleted: false, source: "event" },
      { id: "l3", account_id: "restaurants:harmons", note: "[event-id:e2]\nEvent logged: Other", is_deleted: false, source: "event" },
      { id: "l4", account_id: "restaurants:harmons", note: "manual call note", is_deleted: false, source: "manual" },
    ],
  });
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY;
  vi.clearAllMocks();
});

import { DELETE } from "@/app/api/events/route";

function makeRequest(id: string | null): NextRequest {
  const url = id
    ? `http://localhost/api/events?id=${encodeURIComponent(id)}`
    : "http://localhost/api/events";
  return new NextRequest(url, { method: "DELETE" });
}

describe("DELETE /api/events", () => {
  it("returns 400 when id is missing", async () => {
    const res = await DELETE(makeRequest(null));
    expect(res.status).toBe(400);
    // Nothing in the fake DB should change.
    expect(fake.state.tables.events).toHaveLength(2);
    expect(fake.state.tables.activity_logs.every((l) => l.is_deleted === false)).toBe(true);
  });

  it("hard-deletes the event row and soft-deletes its [event-id:UUID] activity logs", async () => {
    const res = await DELETE(makeRequest("e1"));
    expect(res.status).toBe(200);

    // Event row removed.
    expect(fake.state.tables.events.map((e) => e.id)).toEqual(["e2"]);

    // l1 + l2 (event source, matches marker) → soft-deleted.
    const logs = fake.state.tables.activity_logs;
    expect(logs.find((l) => l.id === "l1")?.is_deleted).toBe(true);
    expect(logs.find((l) => l.id === "l2")?.is_deleted).toBe(true);
    // l3 references a different event → untouched.
    expect(logs.find((l) => l.id === "l3")?.is_deleted).toBe(false);
    // l4 is a manual log → untouched.
    expect(logs.find((l) => l.id === "l4")?.is_deleted).toBe(false);
  });

  it("does not affect logs for other events when deleting e2", async () => {
    await DELETE(makeRequest("e2"));
    const logs = fake.state.tables.activity_logs;
    expect(logs.find((l) => l.id === "l3")?.is_deleted).toBe(true);
    expect(logs.find((l) => l.id === "l1")?.is_deleted).toBe(false);
    expect(logs.find((l) => l.id === "l2")?.is_deleted).toBe(false);
  });
});
