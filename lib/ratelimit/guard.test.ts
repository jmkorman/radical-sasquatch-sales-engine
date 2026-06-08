// applyRateLimit — proves the 429 response includes the standard headers
// (Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining) and that the
// allowed case returns blocked=null so callers can early-return cleanly.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyRateLimit, LIMITS } from "@/lib/ratelimit/guard";
import { __resetRateLimiterForTests } from "@/lib/ratelimit/limiter";

beforeEach(() => __resetRateLimiterForTests());
afterEach(() => __resetRateLimiterForTests());

function makeReq(ip = "5.5.5.5"): Request {
  return new Request("https://example.com/api/events", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("applyRateLimit", () => {
  it("returns blocked=null when under the limit", () => {
    const { blocked } = applyRateLimit(makeReq(), "events:write", {
      limit: 5,
      windowMs: 60_000,
    });
    expect(blocked).toBeNull();
  });

  it("returns a 429 NextResponse once the limit is hit", async () => {
    const cfg = { limit: 2, windowMs: 60_000 };
    applyRateLimit(makeReq(), "events:write", cfg);
    applyRateLimit(makeReq(), "events:write", cfg);
    const { blocked } = applyRateLimit(makeReq(), "events:write", cfg);

    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(blocked!.headers.get("X-RateLimit-Limit")).toBe("2");
    expect(blocked!.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(Number(blocked!.headers.get("Retry-After"))).toBeGreaterThan(0);

    const body = await blocked!.json();
    expect(body.error).toBe("Too many requests");
    expect(typeof body.retryAfterSec).toBe("number");
  });

  it("scopes buckets by routeId so a hot route doesn't starve a cold one", () => {
    const cfg = { limit: 1, windowMs: 60_000 };
    expect(applyRateLimit(makeReq(), "events:write", cfg).blocked).toBeNull();
    expect(applyRateLimit(makeReq(), "events:write", cfg).blocked).not.toBeNull();
    // Same IP, different route -> fresh bucket.
    expect(applyRateLimit(makeReq(), "sheets:update", cfg).blocked).toBeNull();
  });

  it("scopes buckets by client IP", () => {
    const cfg = { limit: 1, windowMs: 60_000 };
    expect(applyRateLimit(makeReq("1.1.1.1"), "events:write", cfg).blocked).toBeNull();
    expect(applyRateLimit(makeReq("1.1.1.1"), "events:write", cfg).blocked).not.toBeNull();
    expect(applyRateLimit(makeReq("2.2.2.2"), "events:write", cfg).blocked).toBeNull();
  });

  it("exports LIMITS with the documented routes", () => {
    expect(LIMITS.events.limit).toBeGreaterThan(0);
    expect(LIMITS.events.windowMs).toBe(60_000);
    expect(LIMITS.sheetsUpdate.limit).toBeGreaterThan(0);
    expect(LIMITS.sheetsUpdate.windowMs).toBe(60_000);
  });
});
