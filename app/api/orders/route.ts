import { NextRequest, NextResponse } from "next/server";
import { deleteOrder, getOrders, insertOrder, updateOrder } from "@/lib/supabase/queries";
import { normalizeOrderRecord } from "@/lib/orders/helpers";
import {
  appendOrderHistory,
  appendOrderToSheet,
  ensureActiveAccountForOrder,
  getOrdersFromSheet,
  updateOrderInSheet,
  withOrderDefaults,
} from "@/lib/sheets/orders";
import { OrderRecord } from "@/types/orders";

function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function GET(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get("accountId") ?? undefined;
    const dbOrders = supabaseConfigured()
      ? await getOrders(accountId).catch((error) => {
          console.error("Orders database read error:", error);
          return [] as OrderRecord[];
        })
      : [];

    if (dbOrders.length > 0) {
      return NextResponse.json(
        dbOrders.sort(
          (a, b) =>
            new Date(b.updated_at || b.created_at || b.order_date).getTime() -
            new Date(a.updated_at || a.created_at || a.order_date).getTime()
        )
      );
    }

    const sheetOrders = await getOrdersFromSheet(accountId).catch((error) => {
      console.error("Orders sheet fallback read error:", error);
      return [] as OrderRecord[];
    });

    return NextResponse.json(
      sheetOrders.sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || b.order_date).getTime() -
          new Date(a.updated_at || a.created_at || a.order_date).getTime()
      )
    );
  } catch (error) {
    console.error("Orders GET error:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderInput = withOrderDefaults({
      ...body,
      amount: Number.isFinite(parseFloat(body.amount)) ? parseFloat(body.amount) : 0,
      history: appendOrderHistory(null, "Order created", body.owner || "Sales"),
    });

    const dbOrder = supabaseConfigured()
      ? await insertOrder(orderInput).catch((error) => {
          console.error("Orders database insert error:", error);
          return null;
        })
      : null;

    const order = normalizeOrderRecord({ ...orderInput, ...dbOrder });
    const sheetOrder = await appendOrderToSheet(order).catch((error) => {
      console.error("Orders sheet secondary append error:", error);
      return null;
    });
    const created = normalizeOrderRecord(dbOrder ? { ...sheetOrder, ...dbOrder } : { ...order, ...sheetOrder });

    await ensureActiveAccountForOrder(created).catch((error) => {
      console.error("Active account order sync error:", error);
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Orders POST error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = body.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existingDbOrder = supabaseConfigured()
      ? (await getOrders().catch(() => [] as OrderRecord[])).find((order) => order.id === id)
      : null;
    const existingSheetOrder = existingDbOrder
      ? null
      : (await getOrdersFromSheet().catch(() => [] as OrderRecord[])).find((order) => order.id === id);
    const existingOrder = existingDbOrder ?? existingSheetOrder;
    const updates = body.updates ?? {};
    const progressNote = typeof body.progressNote === "string" ? body.progressNote.trim() : "";
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "Production";
    const statusChanged =
      updates.status && existingOrder?.status && updates.status !== existingOrder.status;

    const historyMessage =
      progressNote || (statusChanged ? `Status changed from ${existingOrder?.status} to ${updates.status}` : "");

    const nextOrder = normalizeOrderRecord({
      ...existingOrder,
      ...updates,
      id,
      updated_at: new Date().toISOString(),
      history: historyMessage
        ? appendOrderHistory(existingOrder?.history, historyMessage, actor)
        : existingOrder?.history ?? null,
    });

    const dbUpdates: Partial<OrderRecord> = { ...nextOrder };
    delete dbUpdates.id;
    delete dbUpdates.created_at;
    const dbOrder = supabaseConfigured()
      ? await updateOrder(id, dbUpdates).catch((error) => {
          console.error("Orders database update error:", error);
          return null;
        })
      : null;

    const updated = normalizeOrderRecord(dbOrder ? { ...nextOrder, ...dbOrder } : nextOrder);
    await updateOrderInSheet(updated).catch((error) => {
      console.error("Orders sheet secondary update error:", error);
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Orders PATCH error:", error);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
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
