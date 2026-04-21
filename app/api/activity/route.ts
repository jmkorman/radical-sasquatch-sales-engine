import { NextRequest, NextResponse } from "next/server";
import { deleteActivityLog, getActivityLogs, getDeletedActivityLogs, insertActivityLog, updateActivityLog } from "@/lib/supabase/queries";

export async function GET(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json([]);
  }
  try {
    const accountId = request.nextUrl.searchParams.get("accountId") ?? undefined;
    const trash = request.nextUrl.searchParams.get("trash") === "true";
    const logs = trash ? await getDeletedActivityLogs(accountId) : await getActivityLogs(accountId);
    return NextResponse.json(logs);
  } catch (error) {
    console.error("Activity GET error:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  try {
    const body = await request.json();
    const log = await insertActivityLog(body);
    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error("Activity POST error:", error);
    return NextResponse.json({ error: "Failed to insert activity log" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const log = await updateActivityLog(body.id, {
      action_type: body.action_type,
      follow_up_date: body.follow_up_date,
      note: body.note,
      status_before: body.status_before,
      status_after: body.status_after,
      next_action_type: body.next_action_type,
      source: body.source,
      activity_kind: body.activity_kind,
      counts_as_contact: body.counts_as_contact,
      ...(body.is_deleted !== undefined ? { is_deleted: body.is_deleted } : {}),
    });
    return NextResponse.json(log);
  } catch (error) {
    console.error("Activity PATCH error:", error);
    return NextResponse.json({ error: "Failed to update activity log" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await deleteActivityLog(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Activity DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete activity log" }, { status: 500 });
  }
}
