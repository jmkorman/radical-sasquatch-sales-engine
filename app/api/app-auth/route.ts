import { NextRequest, NextResponse } from "next/server";
import { validateAppPassword, createAppSession } from "@/lib/auth/appAuth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { password } = body;

  if (!password || !validateAppPassword(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

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
