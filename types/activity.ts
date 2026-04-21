export type ActionType = "call" | "email" | "in-person" | "note" | "sample-sent" | "tasting-complete";
export type ActivitySource = "manual" | "local" | "internal" | "research" | "order" | "notion";
export type ActivityKind = "outreach" | "note" | "research" | "order";

export interface ActivityLog {
  id: string;
  account_id: string;
  tab: string;
  row_index: number;
  account_name: string;
  action_type: ActionType;
  note: string | null;
  status_before: string | null;
  status_after: string | null;
  follow_up_date: string | null;
  notion_task_id: string | null;
  next_action_type?: string | null;
  source: ActivitySource | string;
  created_at: string;
  activity_kind?: ActivityKind;
  counts_as_contact?: boolean;
  is_deleted?: boolean;
}

export interface OutreachFormData {
  actionType: ActionType;
  statusAfter: string;
  note: string;
  followUpDate: string;
}

export interface DeletedLogEntry {
  id: string;
  deleted_at: string;
  log: ActivityLog;
}
