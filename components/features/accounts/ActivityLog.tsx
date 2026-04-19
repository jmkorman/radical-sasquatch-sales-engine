"use client";

import { useState } from "react";
import { ActivityLog as ActivityLogType } from "@/types/activity";
import { formatDate } from "@/lib/utils/dates";
import { parseActivityNote } from "@/lib/activity/notes";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useTrashStore } from "@/stores/useTrashStore";
import { useUIStore } from "@/stores/useUIStore";

const ACTION_ICONS: Record<string, string> = {
  call: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
  email: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  "in-person": "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  note: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
};

export function ActivityLogList({
  logs,
  showDeleted = false,
  onClearFollowUp,
  pendingFollowUpId = null,
  onServerLogsChanged,
}: {
  logs: ActivityLogType[];
  showDeleted?: boolean;
  onClearFollowUp?: (log: ActivityLogType) => void;
  pendingFollowUpId?: string | null;
  onServerLogsChanged?: () => Promise<void> | void;
}) {
  const { deletedLogs, addLogToTrash, restoreLogFromTrash } = useTrashStore();
  const showActionFeedbackWithAction = useUIStore((state) => state.showActionFeedbackWithAction);
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);
  const [busyId, setBusyId] = useState<string | null>(null);
  const deletedIds = new Set(deletedLogs.map((entry) => entry.id));
  const visibleLogs = showDeleted
    ? logs
    : logs.filter((log) => !deletedIds.has(log.id));

  async function restoreLog(log: ActivityLogType) {
    if (busyId) return;
    setBusyId(log.id);

    try {
      const response = await fetch("/api/activity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: log.id, is_deleted: false }),
      });

      if (!response.ok) {
        throw new Error("Failed to restore remote log");
      }

      await onServerLogsChanged?.();

      restoreLogFromTrash(log.id);
      showActionFeedback("Timeline entry restored.", "success");
    } finally {
      setBusyId(null);
    }
  }

  async function trashLog(log: ActivityLogType) {
    if (busyId) return;
    setBusyId(log.id);

    try {
      const response = await fetch(`/api/activity?id=${encodeURIComponent(log.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete remote log");
      }
      await onServerLogsChanged?.();

      addLogToTrash(log);
      showActionFeedbackWithAction(
        `Deleted timeline entry for ${log.account_name}.`,
        "Undo",
        () => {
          void restoreLog(log);
        },
        "info"
      );
    } catch {
      showActionFeedback("Couldn’t delete that timeline entry.", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (visibleLogs.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        {showDeleted ? "No deleted logs in trash" : "No activity logged yet"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleLogs.map((log) => {
        const parsedNote = parseActivityNote(log.note);
        const sourceLabel =
          log.source === "research"
            ? "Research"
            : log.source === "internal"
              ? "Internal"
              : "Saved";

        return (
          <div
            key={log.id}
            className="rounded-2xl border border-rs-border/50 bg-black/10 p-3 text-sm"
          >
            <div className="flex gap-3">
              <svg className="w-4 h-4 text-rs-gold flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={ACTION_ICONS[log.action_type] || ACTION_ICONS.note} />
              </svg>

              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-rs-cream capitalize font-semibold">{log.action_type}</span>
                  <span className="rounded-full border border-rs-border/60 bg-white/5 px-2 py-0.5 text-[11px] text-[#d8ccfb]">
                    {sourceLabel}
                  </span>
                  {log.status_after && log.status_before !== log.status_after && (
                    <span className="text-xs text-[#af9fe6]">
                      {log.status_before || "No Status"} to {log.status_after}
                    </span>
                  )}
                  {log.follow_up_date && (
                    <span className="rounded-full border border-rs-punch/40 bg-rs-punch/10 px-2 py-0.5 text-[11px] font-medium text-[#ffd6e8]">
                      Follow up {formatDate(log.follow_up_date)}
                    </span>
                  )}
                </div>

                {parsedNote.summary && (
                  <div className="text-rs-cream font-medium">{parsedNote.summary}</div>
                )}

                {parsedNote.details && (
                  <div className="text-[#d8ccfb] whitespace-pre-wrap">{parsedNote.details}</div>
                )}

                {parsedNote.nextStep && (
                  <div className="text-sm text-rs-gold">
                    Next: <span className="text-[#ece5ff]">{parsedNote.nextStep}</span>
                  </div>
                )}

                {!parsedNote.summary && !parsedNote.details && log.note && (
                  <div className="text-[#d8ccfb] whitespace-pre-wrap">{log.note}</div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="text-xs text-[#9d8dd5]">
                    {formatDate(log.created_at)}
                  </div>
                  <div className="flex items-center gap-2">
                    {log.follow_up_date && !showDeleted && onClearFollowUp && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        disabled={pendingFollowUpId === log.id}
                        onClick={() => onClearFollowUp(log)}
                      >
                        {pendingFollowUpId === log.id ? "Clearing..." : "Clear Follow-Up"}
                      </Button>
                    )}
                    <Link
                      href={`/accounts/${log.tab}/${log.row_index}`}
                      className="text-xs text-rs-gold hover:text-rs-cream"
                    >
                      Open account
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      disabled={busyId === log.id}
                      onClick={() => {
                        if (showDeleted) {
                          void restoreLog(log);
                        } else {
                          void trashLog(log);
                        }
                      }}
                    >
                      {busyId === log.id ? (showDeleted ? "Restoring..." : "Deleting...") : showDeleted ? "Restore" : "Trash"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
