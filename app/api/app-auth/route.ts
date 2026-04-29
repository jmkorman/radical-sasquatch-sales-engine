import { NextRequest, NextResponse } from "next/server";
import { validateAppPassword, createAppSession } from "@/lib/auth/appAuth";

// Best-effort in-memory rate limit. Works within a single lambda warm instance;
// serverless cold starts reset it, so this is a speed bump, not a wall.
// Combined with the 800ms failure delay below, it dramatically slows brute force.
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now - record.firstAt > WINDOW_MS) {
    attempts.set(ip, { count: 0, firstAt: now });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (record.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((WINDOW_MS - (now - record.firstAt)) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordFailure(ip: string) {
  const record = attempts.get(ip);
  if (record) record.count += 1;
}

function clearAttempts(ip: string) {
  attempts.delete(ip);
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const body = await request.json();
  const { password } = body;

  if (!password || !validateAppPassword(password)) {
    recordFailure(ip);
    // Artificial delay slows automated brute force regardless of the in-memory limiter
    await new Promise((resolve) => setTimeout(resolve, 800));
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  clearAttempts(ip);
  const token = await createAppSession();
  const response = NextResponse.json({ success: true });

  response.cookies.set("app_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });

  return response;
}
