import { describe, expect, it } from "vitest";
import { calculateCommission } from "@/lib/commission/calculator";
import type { OrderRecord } from "@/types/orders";
import { normalizeOrderRecord } from "@/lib/orders/helpers";

function order(overrides: Partial<OrderRecord>): OrderRecord {
  return normalizeOrderRecord({
    id: "o",
    account_id: "a:b",
    account_name: "A",
    tab: "Restaurants",
    order_date: new Date().toISOString().slice(0, 10),
    status: "New",
    amount: 0,
    ...overrides,
  });
}

describe("calculateCommission", () => {
  it("is 10% of total revenue across non-cancelled orders in the last 30 days", () => {
    const recent = new Date().toISOString().slice(0, 10);
    const commission = calculateCommission([
      order({ id: "1", amount: 100, order_date: recent, status: "New" }),
      order({ id: "2", amount: 250, order_date: recent, status: "Delivered" }),
    ]);
    expect(commission).toBe(35); // 10% of 350
  });

  it("excludes Canceled orders even if recent", () => {
    const recent = new Date().toISOString().slice(0, 10);
    const commission = calculateCommission([
      order({ id: "1", amount: 100, order_date: recent, status: "New" }),
      order({ id: "2", amount: 9999, order_date: recent, status: "Canceled" }),
    ]);
    expect(commission).toBe(10);
  });

  it("excludes orders older than 30 days", () => {
    const tooOld = new Date(Date.now() - 31 * 86400 * 1000).toISOString().slice(0, 10);
    const recent = new Date().toISOString().slice(0, 10);
    const commission = calculateCommission([
      order({ id: "old", amount: 1000, order_date: tooOld, status: "New" }),
      order({ id: "new", amount: 500, order_date: recent, status: "New" }),
    ]);
    expect(commission).toBe(50);
  });

  it("returns 0 for an empty list", () => {
    expect(calculateCommission([])).toBe(0);
  });

  it("returns 0 when every order is Canceled", () => {
    const recent = new Date().toISOString().slice(0, 10);
    const commission = calculateCommission([
      order({ id: "1", amount: 100, order_date: recent, status: "Canceled" }),
      order({ id: "2", amount: 200, order_date: recent, status: "Canceled" }),
    ]);
    expect(commission).toBe(0);
  });
});
