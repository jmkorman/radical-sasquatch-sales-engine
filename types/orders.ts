export const ORDER_STATUSES = [
  "New",
  "Confirmed",
  "In Production",
  "Ready",
  "Delivered",
  "Invoiced/Paid",
  "Canceled",
] as const;

export const ORDER_PRIORITIES = ["Normal", "High", "Rush"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

export interface OrderRecord {
  id: string;
  account_id: string;
  account_name: string;
  tab: string;
  row_index?: number | null;
  account_type?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  order_name?: string | null;
  order_date: string;
  due_date?: string | null;
  fulfillment_date?: string | null;
  status: OrderStatus;
  priority?: OrderPriority | string | null;
  owner?: string | null;
  details?: string | null;
  production_notes?: string | null;
  amount: number;
  notes: string | null;
  history?: string | null;
  created_at: string;
  updated_at?: string | null;
  sheet_row_index?: number | null;
}
