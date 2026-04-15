import { OrderRecord } from "@/types/orders";

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
