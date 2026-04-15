import { NextRequest, NextResponse } from "next/server";
import { deleteOrder, getOrders, insertOrder } from "@/lib/supabase/queries";

function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function GET(request: NextRequest) {
  if (!supabaseConfigured()) {
    return NextResponse.json([]);
  }

  try {
    const accountId = request.nextUrl.searchParams.get("accountId") ?? undefined;
    const orders = await getOrders(accountId);
    return NextResponse.json(orders);
  } catch (error) {
    console.error("Orders GET error:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const order = await insertOrder(body);
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Orders POST error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await deleteOrder(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Orders DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}
