import { NextResponse } from "next/server";
import { rateLimitCheck, clientKey } from "./limiter";

// Limits are intentionally generous; Jake said "not too restrictive".
// Tuned for normal human + UI-burst usage with headroom for cron-driven and
// poll-driven backfills.
export const LIMITS = {
  // Events POST/PATCH/DELETE: 2 writes/sec sustained, 120/min burst.
  events: { limit: 120, windowMs: 60_000 },
  // Sheet writes are slower (Google Sheets API quotas) and rarer.
  sheetsUpdate: { limit: 60, windowMs: 60_000 },
} as const;

export interface GuardResult {
  blocked: NextResponse | null;
}

/**
 * Check the limiter and return a 429 NextResponse if exceeded.
 * Caller pattern:
 *   const { blocked } = applyRateLimit(request, "events", LIMITS.events);
 *   if (blocked) return blocked;
 */
export function applyRateLimit(
  request: Request,
  routeId: string,
  cfg: { limit: number; windowMs: number }
): GuardResult {
  const key = clientKey(request, routeId);
  const result = rateLimitCheck({ key, limit: cfg.limit, windowMs: cfg.windowMs });

  if (result.allowed) return { blocked: null };

  const response = NextResponse.json(
    {
      error: "Too many requests",
      retryAfterSec: result.retryAfterSec,
    },
    { status: 429 }
  );
  response.headers.set("Retry-After", String(result.retryAfterSec));
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", "0");
  return { blocked: response };
}
