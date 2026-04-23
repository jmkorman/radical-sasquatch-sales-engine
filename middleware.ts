import { NextRequest, NextResponse } from "next/server";

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) {
    binary += String.fromCharCode(view[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function verifySessionToken(token: string): Promise<boolean> {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "fallback-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = bytesToBase64Url(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`))
  );
  if (expected !== signature) return false;

  const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { exp?: number };
  return typeof claims.exp === "number" && claims.exp * 1000 > Date.now();
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const openPaths = [
    "/login",
    "/api/app-auth",
    "/favicon.ico",
  ];

  if (
    openPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname.startsWith("/_next/")
  ) {
    return NextResponse.next();
  }

  if (
    pathname === "/api/prospects/run" &&
    (
      (process.env.CRON_SECRET && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`) ||
      request.headers.get("user-agent")?.toLowerCase().includes("vercel-cron")
    )
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("app_session")?.value;
  const authenticated = token ? await verifySessionToken(token) : false;

  if (authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
