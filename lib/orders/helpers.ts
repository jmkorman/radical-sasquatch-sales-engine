import { OrderRecord, ORDER_STATUSES } from "@/types/orders";

export function normalizeOrderRecord(order: Partial<OrderRecord>): OrderRecord {
  const now = new Date().toISOString();
  const status = ORDER_STATUSES.includes(order.status as OrderRecord["status"])
    ? (order.status as OrderRecord["status"])
    : "New";

  return {
    id: order.id ?? "",
    account_id: order.account_id ?? "",
    account_name: order.account_name ?? "",
    tab: order.tab ?? "",
    row_index: order.row_index ?? null,
    account_type: order.account_type ?? null,
    contact_name: order.contact_name ?? null,
    phone: order.phone ?? null,
    email: order.email ?? null,
    order_name: order.order_name ?? null,
    order_date: order.order_date ?? now.slice(0, 10),
    due_date: order.due_date ?? null,
    fulfillment_date: order.fulfillment_date ?? null,
    status,
    priority: order.priority ?? "Normal",
    owner: order.owner ?? null,
    details: order.details ?? null,
    production_notes: order.production_notes ?? order.notes ?? null,
    amount: Number.isFinite(order.amount) ? Number(order.amount) : 0,
    notes: order.notes ?? null,
    history: order.history ?? null,
    created_at: order.created_at ?? now,
    updated_at: order.updated_at ?? null,
    sheet_row_index: order.sheet_row_index ?? null,
  };
}

export function getLatestOrder(orders: OrderRecord[]): OrderRecord | null {
  if (!orders.length) return null;
  return [...orders].sort(
    (a, b) =>
      new Date(b.order_date || b.created_at).getTime() -
      new Date(a.order_date || a.created_at).getTime()
  )[0] ?? null;
}

export function getOrderStats(orders: OrderRecord[]) {
  const latest = getLatestOrder(orders);
  const total = orders.reduce((sum, order) => sum + (Number.isFinite(order.amount) ? order.amount : 0), 0);
  return {
    latest,
    total,
    count: orders.length,
  };
}
