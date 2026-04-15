import { NextRequest, NextResponse } from "next/server";
import { verifyAppSession } from "@/lib/auth/appAuth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth for login, API auth routes, and static files
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/app-auth") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("app_session");
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const valid = await verifyAppSession(sessionCookie.value);
  if (!valid) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
