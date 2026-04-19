import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  // Auth disabled - allow all requests through
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
