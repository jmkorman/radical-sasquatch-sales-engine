// CRON_SECRET guard tests for every cron endpoint.
// Verifies the documented invariant: missing or mismatched secret → 401,
// matching secret → not 401 (we don't assert 200 because the route may then
// fail for unrelated reasons in the test environment).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Force the cron handlers to bail before hitting external services after
// auth passes by mocking the heavy collaborators.
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ then: (r: (v: { data: never[]; error: null }) => unknown) => r({ data: [], error: null }) }),
        order: () => ({ then: (r: (v: { data: never[]; error: null }) => unknown) => r({ data: [], error: null }) }),
        not: () => ({ order: () => ({ then: (r: (v: { data: never[]; error: null }) => unknown) => r({ data: [], error: null }) }) }),
        then: (r: (v: { data: never[]; error: null; count: number }) => unknown) =>
          r({ data: [], error: null, count: 0 }),
      }),
    }),
  }),
}));
vi.mock("@/lib/gmail/sent", () => ({
  checkGmailConnectivity: vi.fn(async () => ({ status: "not_configured" })),
}));
vi.mock("@/lib/accounts/source", () => ({
  getAccountsData: vi.fn(async () => ({
    data: { restaurants: [], retail: [], catering: [], foodTruck: [], activeAccounts: [] },
    source: "supabase",
  })),
}));
vi.mock("@/lib/supabase/queries", () => ({
  getActivityLogs: vi.fn(async () => []),
  updateAccountSnapshot: vi.fn(async () => null),
  getAppSetting: vi.fn(async () => null),
  upsertAppSetting: vi.fn(async () => undefined),
  insertActivityLog: vi.fn(async () => ({})),
}));
vi.mock("@/lib/notion/tasks", () => ({
  getCompletedTasks: vi.fn(async () => []),
}));

const ENDPOINTS = [
  {
    name: "health",
    method: "GET" as const,
    importer: () => import("@/app/api/cron/health/route"),
    url: "http://localhost/api/cron/health",
  },
  {
    name: "stale-sweep",
    method: "GET" as const,
    importer: () => import("@/app/api/cron/stale-sweep/route"),
    url: "http://localhost/api/cron/stale-sweep",
  },
  {
    name: "notion-sync",
    method: "POST" as const,
    importer: () => import("@/app/api/notion/sync/route"),
    url: "http://localhost/api/notion/sync",
  },
];

const ORIGINAL = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
  vi.clearAllMocks();
});

describe("CRON_SECRET guard", () => {
  for (const ep of ENDPOINTS) {
    describe(ep.name, () => {
      it("returns 401 with no Authorization header", async () => {
        const mod = await ep.importer();
        const handler = (mod as Record<string, unknown>)[ep.method] as
          (req: NextRequest) => Promise<Response>;
        const req = new NextRequest(ep.url, { method: ep.method });
        const res = await handler(req);
        expect(res.status).toBe(401);
      });

      it("returns 401 with a mismatched Authorization header", async () => {
        const mod = await ep.importer();
        const handler = (mod as Record<string, unknown>)[ep.method] as
          (req: NextRequest) => Promise<Response>;
        const req = new NextRequest(ep.url, {
          method: ep.method,
          headers: { Authorization: "Bearer not-the-secret" },
        });
        const res = await handler(req);
        expect(res.status).toBe(401);
      });

      it("returns 401 when CRON_SECRET env var is unset, even with any header", async () => {
        delete process.env.CRON_SECRET;
        const mod = await ep.importer();
        const handler = (mod as Record<string, unknown>)[ep.method] as
          (req: NextRequest) => Promise<Response>;
        const req = new NextRequest(ep.url, {
          method: ep.method,
          headers: { Authorization: "Bearer anything-goes" },
        });
        const res = await handler(req);
        expect(res.status).toBe(401);
      });

      it("passes the auth gate (status !== 401) with the correct Bearer secret", async () => {
        const mod = await ep.importer();
        const handler = (mod as Record<string, unknown>)[ep.method] as
          (req: NextRequest) => Promise<Response>;
        const req = new NextRequest(ep.url, {
          method: ep.method,
          headers: { Authorization: "Bearer test-secret" },
        });
        const res = await handler(req);
        expect(res.status).not.toBe(401);
      });
    });
  }
});
