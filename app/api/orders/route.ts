import { NextRequest, NextResponse } from "next/server";
import {
  deleteOrder,
  getOrders,
  insertActivityLog,
  insertOrder,
  updateOrder,
} from "@/lib/supabase/queries";
import { normalizeOrderRecord } from "@/lib/orders/helpers";
import {
  ensureActiveAccountForOrder,
  getOrdersFromSheet,
  withOrderDefaults,
} from "@/lib/sheets/orders";
import { OrderRecord } from "@/types/orders";

export const maxDuration = 30;

function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function configError() {
  return NextResponse.json(
    { error: "Supabase is not configured. Orders require a database connection." },
    { status: 503 }
  );
}

// Supabase errors are plain objects, not Error instances. Extract a useful
// message from either shape so the client doesn't see a generic fallback.
function describeError(error: unknown): string {
  if (!error) return "Unknown error";
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object") {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint, e.code ? `(code ${e.code})` : null].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  return String(error);
}

function buildOrderActivityNote(order: OrderRecord, kind: "created" | "updated"): string {
  const amount = order.amount ? `$${order.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "";
  const name = order.order_name || "Untitled order";
  const dueParts: string[] = [];
  if (order.fulfillment_date) dueParts.push(`fulfill ${order.fulfillment_date}`);
  else if (order.due_date) dueParts.push(`due ${order.due_date}`);
  const tail = dueParts.length ? ` (${dueParts.join(", ")})` : "";
  const action = kind === "created" ? "Order logged" : "Order updated";
  return `${action}: ${name}${amount ? ` — ${amount}` : ""}${tail}`;
}

async function logOrderActivity(order: OrderRecord, kind: "created" | "updated") {
  if (!order.account_id || !order.tab) return;
  try {
    await insertActivityLog({
      account_id: order.account_id,
      tab: order.tab,
      row_index: order.row_index ?? 0,
      account_name: order.account_name,
      action_type: "note",
      note: buildOrderActivityNote(order, kind),
      source: "order",
      activity_kind: "order",
      counts_as_contact: false,
    });
  } catch (error) {
    console.error("Order activity log error:", error);
  }
}

export async function GET(request: NextRequest) {
  if (!supabaseConfigured()) return configError();

  try {
    const accountId = request.nextUrl.searchParams.get("accountId") ?? undefined;
    const accountName = request.nextUrl.searchParams.get("accountName") ?? undefined;

    // Supabase is the source of truth, but we still read legacy sheet-only
    // orders so historical data created before the cutover is recoverable.
    // Writes never touch the sheet anymore.
    const [dbOrders, sheetOrders] = await Promise.all([
      getOrders(accountId, accountName),
      getOrdersFromSheet(accountId).catch((error) => {
        console.error("Orders sheet legacy read error:", error);
        return [] as OrderRecord[];
      }),
    ]);

    const seen = new Set(dbOrders.map((o) => o.id).filter(Boolean));
    const merged = [...dbOrders];
    for (const sheetOrder of sheetOrders) {
      if (!sheetOrder.id || seen.has(sheetOrder.id)) continue;
      if (
        accountName &&
        sheetOrder.account_name !== accountName &&
        sheetOrder.account_id !== accountId
      ) {
        continue;
      }
      merged.push(sheetOrder);
      seen.add(sheetOrder.id);
    }

    return NextResponse.json(
      merged.sort(
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
  if (!supabaseConfigured()) return configError();

  try {
    const body = await request.json();
    const orderInput = withOrderDefaults({
      ...body,
      amount: Number.isFinite(parseFloat(body.amount)) ? parseFloat(body.amount) : 0,
    });

    const dbOrder = await insertOrder(orderInput);
    const created = normalizeOrderRecord({ ...orderInput, ...dbOrder });

    await logOrderActivity(created, "created");

    await ensureActiveAccountForOrder(created).catch((error) => {
      console.error("Active account order sync error:", error);
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Orders POST error:", error);
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!supabaseConfigured()) return configError();

  try {
    const body = await request.json();
    const id = body.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existingOrder = (await getOrders().catch(() => [] as OrderRecord[])).find(
      (order) => order.id === id
    );
    const updates = body.updates ?? {};

    const nextOrder = normalizeOrderRecord({
      ...existingOrder,
      ...updates,
      id,
      updated_at: new Date().toISOString(),
    });

    const dbUpdates: Partial<OrderRecord> = { ...nextOrder };
    delete dbUpdates.id;
    delete dbUpdates.created_at;

    const dbOrder = await updateOrder(id, dbUpdates);
    const updated = normalizeOrderRecord({ ...nextOrder, ...dbOrder });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Orders PATCH error:", error);
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!supabaseConfigured()) return configError();

  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await deleteOrder(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Orders DELETE error:", error);
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}
