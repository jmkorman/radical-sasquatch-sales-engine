import { ActionType, ActivityKind, ActivityLog } from "@/types/activity";

const OUTREACH_ACTIONS: ActionType[] = ["call", "email", "in-person", "sample-sent", "tasting-complete"];

export function getActivityKind(log: Pick<ActivityLog, "action_type" | "source" | "activity_kind">): ActivityKind {
  if (log.activity_kind) return log.activity_kind;
  if (log.source === "research") return "research";
  if (log.source === "order") return "order";
  if (log.action_type === "note") return "note";
  return "outreach";
}

export function countsAsContact(log: Pick<ActivityLog, "action_type" | "source" | "activity_kind" | "counts_as_contact">): boolean {
  if (typeof log.counts_as_contact === "boolean") return log.counts_as_contact;
  return OUTREACH_ACTIONS.includes(log.action_type as ActionType) && getActivityKind(log as ActivityLog) === "outreach";
}

export function getLatestContactLog(logs: ActivityLog[]): ActivityLog | null {
  for (const log of logs) {
    if (countsAsContact(log)) return log;
  }
  return null;
}
