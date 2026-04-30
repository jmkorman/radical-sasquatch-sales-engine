import { AllTabsData, AnyAccount } from "@/types/accounts";
import { OrderRecord } from "@/types/orders";

const COMMISSION_RATE = 0.1;
const WINDOW_DAYS = 30;

/**
 * Estimated commission = 10% of revenue from real orders booked in the last
 * 30 days. Cancelled orders are excluded; everything else (New, Confirmed,
 * In Production, Ready, Delivered, Invoiced/Paid) counts as booked revenue.
 */
export function calculateCommission(orders: OrderRecord[]): number {
  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const recentTotal = orders
    .filter((order) => {
      if (order.status === "Canceled") return false;
      const dateStr = order.order_date || order.created_at;
      if (!dateStr) return false;
      const ts = new Date(dateStr).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    })
    .reduce((sum, order) => sum + (Number.isFinite(order.amount) ? order.amount : 0), 0);

  return recentTotal * COMMISSION_RATE;
}

export function getStatusCounts(data: AllTabsData): Record<string, number> {
  const allAccounts: AnyAccount[] = [
    ...data.restaurants,
    ...data.retail,
    ...data.catering,
    ...data.foodTruck,
    ...data.activeAccounts,
  ];

  const counts: Record<string, number> = {
    Identified: 0,
    Researched: 0,
    Contacted: 0,
    "Following Up": 0,
    "Closed - Won": 0,
    "": 0,
  };

  for (const a of allAccounts) {
    const s = a.status || "";
    counts[s] = (counts[s] || 0) + 1;
  }

  return counts;
}
