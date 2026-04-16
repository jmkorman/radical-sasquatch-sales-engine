"use client";

import Link from "next/link";
import { AnyAccount, AllTabsData } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { Card } from "@/components/ui/Card";
import { parseDateFromText, formatDate, daysSince } from "@/lib/utils/dates";
import { getAllAccounts, getLatestContactLogForAccount, getResolvedFollowUpDate } from "@/lib/activity/timeline";

interface FollowUpItem {
  account: AnyAccount;
  reason: string;
  bucket: "overdue" | "today" | "upcoming";
  followUpDate: string;
}

export function buildFollowUpQueue(
  data: AllTabsData,
  logs: ActivityLog[]
): FollowUpItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return getAllAccounts(data)
    .map((account) => {
      const latestLog = getLatestContactLogForAccount(logs, account);
      const followUpRaw = getResolvedFollowUpDate(account, logs);
      const followUpDate = followUpRaw ? new Date(followUpRaw) : null;

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

      return {
        account,
        reason,
        bucket,
        followUpDate: followUpDate.toISOString(),
      };
    })
    .filter((item): item is FollowUpItem => Boolean(item))
    .sort((a, b) => new Date(a.followUpDate).getTime() - new Date(b.followUpDate).getTime());
}

export function FollowUpQueue({ items }: { items: FollowUpItem[] }) {
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
              <div className="text-sm text-rs-gold">{formatDate(item.followUpDate)}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
