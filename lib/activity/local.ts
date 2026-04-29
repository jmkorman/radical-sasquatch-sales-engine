import { OutreachEntry } from "@/stores/useOutreachStore";
import { extractGmailMarkers } from "@/lib/activity/gmailMarkers";
import { ActionType, ActivityLog } from "@/types/activity";

function normalizeActivitySegment(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function getActivityFingerprint(log: ActivityLog): string {
  const { messageId, threadId } = extractGmailMarkers(log.note);
  if (messageId || threadId) {
    return [
      "gmail",
      normalizeActivitySegment(log.account_id),
      normalizeActivitySegment(messageId),
      normalizeActivitySegment(threadId),
      normalizeActivitySegment(log.action_type),
    ].join("|");
  }

  const minuteBucket = Math.floor(new Date(log.created_at).getTime() / 60000);

  return [
    normalizeActivitySegment(log.tab),
    normalizeActivitySegment(log.account_name),
    normalizeActivitySegment(log.action_type),
    normalizeActivitySegment(log.note),
    normalizeActivitySegment(log.status_before),
    normalizeActivitySegment(log.status_after),
    normalizeActivitySegment(log.activity_kind),
    log.counts_as_contact === false ? "0" : "1",
    Number.isFinite(minuteBucket) ? String(minuteBucket) : normalizeActivitySegment(log.created_at),
  ].join("|");
}

export function outreachEntriesToActivityLogs(entries: OutreachEntry[]): ActivityLog[] {
  return entries.map((entry) => {
    const parts = entry.account_id.split("_");
    const rowIndex = Number.parseInt(parts[parts.length - 1] ?? "0", 10);

    return {
      id: entry.id,
      account_id: entry.account_id,
      tab: entry.tab,
      row_index: Number.isFinite(rowIndex) ? rowIndex : 0,
      account_name: entry.account_name,
      action_type: entry.action_type as ActionType,
      note: entry.note || null,
      status_before: entry.status_before || null,
      status_after: entry.status_after || null,
      follow_up_date: entry.follow_up_date,
      notion_task_id: null,
      next_action_type: entry.next_action_type ?? null,
      source: entry.source ?? "local",
      created_at: entry.created_at,
      activity_kind: entry.activity_kind,
      counts_as_contact: entry.counts_as_contact,
    };
  });
}

export function activityLogToOutreachEntry(log: ActivityLog): OutreachEntry {
  return {
    id: log.id,
    account_id: log.account_id,
    account_name: log.account_name,
    tab: log.tab,
    action_type: log.action_type,
    note: log.note || "",
    status_before: log.status_before || "",
    status_after: log.status_after || "",
    follow_up_date: log.follow_up_date,
    next_action_type: log.next_action_type ?? null,
    created_at: log.created_at,
    source: log.source,
    activity_kind: log.activity_kind,
    counts_as_contact: log.counts_as_contact,
  };
}

export function mergeActivityLogs(...groups: ActivityLog[][]): ActivityLog[] {
  const byFingerprint = new Map<string, ActivityLog>();

  for (const group of groups) {
    for (const log of group) {
      const fingerprint = getActivityFingerprint(log);
      if (!byFingerprint.has(fingerprint)) {
        byFingerprint.set(fingerprint, log);
      }
    }
  }

  return Array.from(byFingerprint.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
