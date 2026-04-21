"use client";

import Link from "next/link";
import { AnyAccount, AllTabsData } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { Card } from "@/components/ui/Card";
import { formatDate, daysSince, parseAppDate } from "@/lib/utils/dates";
import { getAllAccounts, getResolvedFollowUpDate, getScheduledFollowUpLogForAccount } from "@/lib/activity/timeline";

interface FollowUpItem {
  account: AnyAccount;
  reason: string;
  bucket: "overdue" | "today" | "upcoming";
  followUpDate: string;
  logId: string | null;
}

export function buildFollowUpQueue(
  data: AllTabsData,
  logs: ActivityLog[]
): FollowUpItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return getAllAccounts(data)
    .map((account) => {
      const followUpRaw = getResolvedFollowUpDate(account, logs);
      const followUpDate = followUpRaw ? parseAppDate(followUpRaw) : null;

      if (!followUpDate || isNaN(followUpDate.getTime())) return null;

      const bucket =
        followUpDate.getTime() < today.getTime()
          ? "overdue"
          : followUpDate.getTime() === today.getTime()
            ? "today"
            : "upcoming";

      const reason =
        bucket === "overdue"
          ? `Overdue follow-up, last touch ${daysSince(account.contactDate)} days ago`
          : bucket === "today"
            ? "Follow-up scheduled for today"
            : "Upcoming scheduled follow-up";

      const followUpLog = getScheduledFollowUpLogForAccount(logs, account);
      return {
        account,
        reason,
        bucket,
        followUpDate: followUpDate.toISOString(),
        logId: followUpLog?.id ?? null,
      };
    })
    .filter((item): item is FollowUpItem => Boolean(item))
    .sort((a, b) => new Date(a.followUpDate).getTime() - new Date(b.followUpDate).getTime());
}

function snoozeDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function FollowUpQueue({
  items,
  onSnooze,
}: {
  items: FollowUpItem[];
  onSnooze?: (logId: string, newDate: string) => Promise<void>;
}) {
  if (!items.length) return null;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] uppercase tracking-[0.4em] text-rs-sunset/85 mb-2">
          Follow-Up Queue
        </div>
        <div className="text-sm text-[#d8ccfb]">
          Clean handoff of what needs attention next, beyond the hit list.
        </div>
      </div>

      <div className="grid gap-3">
        {items.slice(0, 8).map((item) => (
          <Card key={`${item.account._tabSlug}_${item.account._rowIndex}_followup`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/accounts/${item.account._tabSlug}/${item.account._rowIndex}`}
                    className="font-semibold text-rs-cream hover:text-rs-gold"
                  >
                    {item.account.account}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      item.bucket === "overdue"
                        ? "bg-rs-punch/15 text-[#ffd6e8] border border-rs-punch/40"
                        : item.bucket === "today"
                          ? "bg-rs-sunset/15 text-rs-sunset border border-rs-sunset/40"
                          : "bg-rs-gold/15 text-rs-gold border border-rs-gold/40"
                    }`}
                  >
                    {item.bucket === "overdue" ? "Overdue" : item.bucket === "today" ? "Today" : "Upcoming"}
                  </span>
                </div>
                <div className="mt-1 text-sm text-[#d8ccfb]">{item.reason}</div>
              </div>
              <div className="flex items-center gap-3">
                {item.logId && onSnooze && (
                  <div className="flex gap-1">
                    {[{ label: "+2d", days: 2 }, { label: "+1w", days: 7 }].map(({ label, days }) => (
                      <button
                        key={label}
                        onClick={() => onSnooze(item.logId!, snoozeDate(days))}
                        className="rounded border border-rs-border/60 bg-white/5 px-2 py-0.5 text-[11px] text-[#af9fe6] hover:border-rs-gold/50 hover:text-rs-gold transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="text-sm text-rs-gold whitespace-nowrap">{formatDate(item.followUpDate)}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
