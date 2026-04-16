"use client";

import { ActivityLog } from "@/types/activity";
import { parseActivityNote } from "@/lib/activity/notes";

const ACTION_ICONS: Record<string, string> = {
  call: "📞",
  email: "✉️",
  "in-person": "🤝",
  note: "📝",
};

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function RecentActivity({ entries }: { entries: ActivityLog[] }) {
  if (entries.length === 0) return null;

  const recent = entries.slice(0, 8);

  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.4em] text-rs-sunset/85 mb-3">
        Recent Activity
      </div>
      <div className="rounded-2xl border border-rs-border/60 bg-white/[0.03] divide-y divide-rs-border/30">
        {recent.map((entry) => {
          const parsed = parseActivityNote(entry.note);
          const displayText = parsed.summary || parsed.details || entry.note;

          return (
            <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 text-base shrink-0">
                {ACTION_ICONS[entry.action_type] ?? "📝"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-rs-gold truncate">
                    {entry.account_name}
                  </span>
                  {entry.status_after && entry.status_after !== entry.status_before && (
                    <span className="text-xs text-[#bcaef0] shrink-0">
                      → {entry.status_after}
                    </span>
                  )}
                  <span className="text-xs text-gray-500 ml-auto shrink-0">
                    {timeAgo(entry.created_at)}
                  </span>
                </div>
                {displayText && (
                  <p className="text-xs text-[#d8ccfb]/80 mt-0.5 line-clamp-1">
                    {displayText}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
