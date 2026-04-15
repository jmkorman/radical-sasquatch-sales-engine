export type ActionType = "call" | "email" | "in-person" | "note";

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
  source: string;
  created_at: string;
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
