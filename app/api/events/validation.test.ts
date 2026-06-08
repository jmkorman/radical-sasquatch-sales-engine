// Tests for the additive input validation added to /api/events.
// Stubs Supabase + helpers so the handlers reach the validation layer.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, FakeSupabaseClient } from "@/lib/__tests__/fakeSupabase";

let fake: FakeSupabaseClient;

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => fake,
}));

// insertEvent / updateEvent normally hit Supabase. We don't care about the
// row that comes back — we only assert validation behaviour. Stub to a row
// that satisfies normalizeEventRecord (any object works because the route
// merges with the inbound payload first).
vi.mock("@/lib/events/queries", () => ({
  getEvents: vi.fn(async () => []),
  insertEvent: vi.fn(async (payload) => ({ ...payload, id: "new-id" })),
  updateEvent: vi.fn(async (_id, updates) => ({ id: "e1", ...updates })),
  deleteEvent: vi.fn(async () => undefined),
}));

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  fake = createFakeSupabase({ events: [], activity_logs: [] });
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY;
  vi.clearAllMocks();
});

import { POST, PATCH } from "@/app/api/events/route";

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/events", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function patchReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/events", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_BASE = {
  account_id: "restaurants:harmons",
  account_name: "Harmons",
  event_date: "2026-06-15",
};

describe("POST /api/events — input validation", () => {
  it("rejects non-JSON body with 400", async () => {
    const res = await POST(postReq("not-json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });

  it("rejects an array body", async () => {
    const res = await POST(postReq([1, 2, 3]));
    expect(res.status).toBe(400);
  });

  it("rejects malformed event_date", async () => {
    const res = await POST(postReq({ ...VALID_BASE, event_date: "6/15/2026" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/event_date/);
  });

  it("rejects malformed event_end_date", async () => {
    const res = await POST(postReq({ ...VALID_BASE, event_end_date: "tomorrow" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/event_end_date/);
  });

  it("rejects negative quoted_amount", async () => {
    const res = await POST(postReq({ ...VALID_BASE, quoted_amount: -50 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/non-negative/);
  });

  it("rejects non-numeric actual_amount", async () => {
    const res = await POST(postReq({ ...VALID_BASE, actual_amount: "not-a-number" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/must be a number/);
  });

  it("rejects an oversized notes field", async () => {
    const res = await POST(postReq({ ...VALID_BASE, notes: "x".repeat(5001) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/maximum length/);
  });

  it("accepts a valid payload (201)", async () => {
    const res = await POST(
      postReq({
        ...VALID_BASE,
        title: "Tasting",
        quoted_amount: 500,
        actual_amount: 450,
        deposit: 100,
      })
    );
    expect(res.status).toBe(201);
  });

  it("still returns the existing 400 when required fields are missing", async () => {
    const res = await POST(postReq({ account_id: "x" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });
});

describe("PATCH /api/events — input validation", () => {
  it("rejects non-JSON body with 400", async () => {
    const res = await PATCH(patchReq("definitely-not-json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when id is missing", async () => {
    const res = await PATCH(patchReq({ updates: { title: "x" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/id/);
  });

  it("rejects non-object updates", async () => {
    const res = await PATCH(patchReq({ id: "e1", updates: "stringy" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/updates/);
  });

  it("rejects negative actual_amount in updates", async () => {
    const res = await PATCH(patchReq({ id: "e1", updates: { actual_amount: -1 } }));
    expect(res.status).toBe(400);
  });

  it("accepts a valid PATCH (200)", async () => {
    const res = await PATCH(patchReq({ id: "e1", updates: { title: "Renamed" } }));
    expect(res.status).toBe(200);
  });
});
