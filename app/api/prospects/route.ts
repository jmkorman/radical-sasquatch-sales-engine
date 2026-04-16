import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json([]);
  }
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("prospects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("Prospects GET error:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("prospects")
      .insert([body])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Prospects POST error:", error);
    return NextResponse.json({ error: "Failed to add prospect" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    const supabase = createServerClient();

    // Mark prospect as added
    const { error } = await supabase
      .from("prospects")
      .update({ added_to_sheet: true })
      .eq("id", id);

    if (error) throw error;

    // TODO: Add row to the actual Google Sheet tab via Sheets API append

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Prospects PUT error:", error);
    return NextResponse.json({ error: "Failed to update prospect" }, { status: 500 });
  }
}
