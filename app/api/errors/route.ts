import { NextRequest, NextResponse } from "next/server";
import { acknowledgeAllErrors, acknowledgeError, getRecentErrors } from "@/lib/errors/log";

export const dynamic = "force-dynamic";

export async function GET() {
  const errors = await getRecentErrors(100);
  return NextResponse.json({ errors });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.all === true) {
      const ok = await acknowledgeAllErrors();
      return NextResponse.json({ success: ok });
    }
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const ok = await acknowledgeError(body.id);
    return NextResponse.json({ success: ok });
  } catch (error) {
    console.error("Errors PATCH error:", error);
    return NextResponse.json({ error: "Failed to acknowledge" }, { status: 500 });
  }
}
