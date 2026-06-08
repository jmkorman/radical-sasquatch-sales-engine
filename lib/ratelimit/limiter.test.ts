// Sliding-window rate limiter — proves (a) the window slides correctly,
// (b) retry-after math matches "oldest-hit + window - now", and (c) the
// per-key isolation is real (different IPs do not share buckets).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetRateLimiterForTests,
  clientKey,
  rateLimitCheck,
} from "@/lib/ratelimit/limiter";

beforeEach(() => {
  __resetRateLimiterForTests();
});

afterEach(() => {
  __resetRateLimiterForTests();
});

describe("rateLimitCheck", () => {
  it("allows up to `limit` hits inside the window, then blocks", () => {
    const key = "ip:1.1.1.1:events";
    for (let i = 0; i < 3; i++) {
      const r = rateLimitCheck({ key, limit: 3, windowMs: 1000, now: 1_000 + i });
      expect(r.allowed).toBe(true);
      expect(r.count).toBe(i + 1);
    }
    const blocked = rateLimitCheck({ key, limit: 3, windowMs: 1000, now: 1_005 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("retryAfterSec is ceil((oldest + window - now) / 1000)", () => {
    const key = "ip:retry:events";
    rateLimitCheck({ key, limit: 1, windowMs: 10_000, now: 0 });
    const blocked = rateLimitCheck({ key, limit: 1, windowMs: 10_000, now: 4_500 });
    expect(blocked.allowed).toBe(false);
    // oldest=0, window=10000, now=4500 -> retryMs = 5500 -> ceil(5.5) = 6
    expect(blocked.retryAfterSec).toBe(6);
  });

  it("hits outside the window are evicted before counting", () => {
    const key = "ip:slide:events";
    // 3 hits at t=0, t=100, t=200 with a 1s window
    rateLimitCheck({ key, limit: 3, windowMs: 1000, now: 0 });
    rateLimitCheck({ key, limit: 3, windowMs: 1000, now: 100 });
    rateLimitCheck({ key, limit: 3, windowMs: 1000, now: 200 });
    // At t=1100, the first hit (t=0) has aged out -> count=2 -> allow.
    const r = rateLimitCheck({ key, limit: 3, windowMs: 1000, now: 1100 });
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(3); // 100, 200, 1100
  });

  it("different keys do not share buckets", () => {
    const a = "ip:1.1.1.1:events";
    const b = "ip:2.2.2.2:events";
    rateLimitCheck({ key: a, limit: 1, windowMs: 1000, now: 0 });
    // a is exhausted; b should still get its first allow.
    expect(rateLimitCheck({ key: a, limit: 1, windowMs: 1000, now: 1 }).allowed).toBe(false);
    expect(rateLimitCheck({ key: b, limit: 1, windowMs: 1000, now: 1 }).allowed).toBe(true);
  });

  it("count reflects the size after trimming, including the new hit", () => {
    const key = "ip:count:events";
    const r1 = rateLimitCheck({ key, limit: 5, windowMs: 1000, now: 0 });
    expect(r1.count).toBe(1);
    const r2 = rateLimitCheck({ key, limit: 5, windowMs: 1000, now: 10 });
    expect(r2.count).toBe(2);
  });

  it("retryAfterSec is 0 when allowed", () => {
    const r = rateLimitCheck({ key: "k", limit: 1, windowMs: 1000, now: 0 });
    expect(r.retryAfterSec).toBe(0);
  });
});

describe("clientKey", () => {
  function makeReq(headers: Record<string, string>): Request {
    return new Request("https://example.com/api", { headers });
  }

  it("uses the first IP from x-forwarded-for", () => {
    const req = makeReq({ "x-forwarded-for": "9.9.9.9, 10.0.0.1, 172.16.0.1" });
    expect(clientKey(req, "events")).toBe("events:9.9.9.9");
  });

  it("falls back to 'unknown' when x-forwarded-for is missing", () => {
    const req = makeReq({});
    expect(clientKey(req, "events")).toBe("events:unknown");
  });

  it("falls back to 'unknown' when x-forwarded-for is empty string", () => {
    const req = makeReq({ "x-forwarded-for": "" });
    expect(clientKey(req, "events")).toBe("events:unknown");
  });

  it("trims whitespace around the chosen IP", () => {
    const req = makeReq({ "x-forwarded-for": "   8.8.8.8   , 1.1.1.1" });
    expect(clientKey(req, "sheets:update")).toBe("sheets:update:8.8.8.8");
  });
});
