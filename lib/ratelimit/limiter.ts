// Generous in-memory sliding-window rate limiter.
//
// Why in-memory:
//   - No external dependency (no Vercel KV, no Upstash). Setup cost = zero.
//   - Serverless cold-starts reset counters and each region/instance has its
//     own map. That's a feature here, not a bug — Jake explicitly asked for
//     "not too restrictive". A coordinated multi-region attacker could
//     bypass this; the goal is to stop the dumb-loop / runaway-client case,
//     not a determined adversary.
//   - When this stops being enough (e.g. abuse traffic, or the app scales
//     beyond one region), swap the internals for Upstash Redis without
//     changing the call sites.
//
// API: rateLimitCheck({ key, limit, windowMs }) -> { allowed, retryAfterSec }
// Caller is responsible for choosing a key (usually IP + route).

interface Bucket {
  // Timestamps (ms since epoch) of the requests still inside the window.
  hits: number[];
}

const buckets: Map<string, Bucket> = new Map();

// Cap memory in pathological cases (1M unique keys is the sweep trigger).
const MAX_KEYS = 1_000_000;

function sweepIfNeeded(now: number) {
  if (buckets.size < MAX_KEYS) return;
  // Drop any bucket whose newest hit is >1h old. Cheap and prevents memory
  // creep; the limiter itself only ever windows up to a few minutes.
  for (const [key, bucket] of buckets.entries()) {
    const newest = bucket.hits[bucket.hits.length - 1] ?? 0;
    if (now - newest > 60 * 60 * 1000) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  // Number of seconds the caller should wait before retrying. 0 when allowed.
  retryAfterSec: number;
  // Current count inside the window (for diagnostics / response headers).
  count: number;
  limit: number;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
  now?: number; // injectable for tests
}

export function rateLimitCheck(opts: RateLimitOptions): RateLimitResult {
  const { key, limit, windowMs } = opts;
  const now = opts.now ?? Date.now();
  const cutoff = now - windowMs;

  sweepIfNeeded(now);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  // Trim expired hits.
  while (bucket.hits.length > 0 && bucket.hits[0] < cutoff) {
    bucket.hits.shift();
  }

  if (bucket.hits.length >= limit) {
    // Retry after = time until the oldest in-window hit ages out.
    const oldest = bucket.hits[0];
    const retryMs = Math.max(0, oldest + windowMs - now);
    return {
      allowed: false,
      retryAfterSec: Math.ceil(retryMs / 1000),
      count: bucket.hits.length,
      limit,
    };
  }

  bucket.hits.push(now);
  return {
    allowed: true,
    retryAfterSec: 0,
    count: bucket.hits.length,
    limit,
  };
}

// Test-only: clear all state between cases.
export function __resetRateLimiterForTests(): void {
  buckets.clear();
}

// Convenience: build a stable key from request IP + route.
export function clientKey(request: Request, route: string): string {
  // Vercel forwards the original client IP in x-forwarded-for. Fall back to
  // "unknown" rather than throwing — the limiter still works, it just shares
  // a bucket across the unknown-IP population (which is fine for our intent).
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0]?.trim() || "unknown";
  return `${route}:${ip}`;
}
