export interface OrderRecord {
  id: string;
  account_id: string;
  account_name: string;
  tab: string;
  order_date: string;
  amount: number;
  notes: string | null;
  created_at: string;
}
