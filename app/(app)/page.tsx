"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useSheetStore } from "@/stores/useSheetStore";
import { buildFollowUpQueue } from "@/components/features/dashboard/FollowUpQueue";
import { buildHitList, HitListItem } from "@/lib/dashboard/prioritizer";
import { ActivityLog } from "@/types/activity";
import { AnyAccount } from "@/types/accounts";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { daysSince, parseAppDate } from "@/lib/utils/dates";
import { buildLatestContactMapByAccount, getAllAccounts } from "@/lib/activity/timeline";
import { getAccountPrimaryId, matchesAccountIdentity } from "@/lib/accounts/identity";
import { HitList } from "@/components/features/dashboard/HitList";
import { LogOutreachModal } from "@/components/features/dashboard/LogOutreachModal";
import { persistActivityEntry } from "@/lib/activity/persist";
import { todayISO } from "@/lib/utils/dates";
import { useUIStore } from "@/stores/useUIStore";

type ActionInboxItem = {
  id: string;
  account: AnyAccount;
  label: string;
  detail: string;
  meta: string;
  color: string;
  priority: number;
  logId?: string | null;
  followUpDate?: string;
};

export default function DashboardPage() {
  const { data, fetchAllTabs } = useSheetStore();
  const [hitList, setHitList] = useState<HitListItem[]>([]);
  const [serverLogs, setServerLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [inboxModalAccount, setInboxModalAccount] = useState<AnyAccount | null>(null);
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);

  const mergedLogs = serverLogs;

  const contactActivityMap = useMemo<Record<string, ActivityLog>>(() => {
    if (!data) return {};
    return buildLatestContactMapByAccount(getAllAccounts(data), mergedLogs);
  }, [data, mergedLogs]);

  useEffect(() => {
    if (!data) return;
    const currentData = data;

    async function loadDashboardData() {
      try {
        const activityRes = await fetch("/api/activity", { cache: "no-store" });
        const activityData: ActivityLog[] = activityRes.ok ? await activityRes.json() : [];
        setServerLogs(activityData);
        setHitList(buildHitList(currentData, activityData));
      } catch {
        setHitList(buildHitList(currentData, []));
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [data]);

  async function handleSnoozeFollowUp(logId: string, newDate: string) {
    await fetch("/api/activity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: logId, follow_up_date: newDate }),
    });
    const res = await fetch("/api/activity", { cache: "no-store" });
    if (res.ok) setServerLogs(await res.json());
  }

  async function handleDoneFollowUp(logId: string) {
    await fetch("/api/activity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: logId, follow_up_date: null }),
    });
    const res = await fetch("/api/activity", { cache: "no-store" });
    if (res.ok) setServerLogs(await res.json());
  }

  async function handleInboxOutreach(outreachData: {
    actionType: string;
    statusAfter: string;
    note: string;
    followUpDate: string;
    nextActionType: string;
  }) {
    if (!inboxModalAccount) return;

    try {
      await persistActivityEntry({
        account: inboxModalAccount,
        actionType: outreachData.actionType,
        note: outreachData.note,
        followUpDate: outreachData.followUpDate || null,
        statusBefore: inboxModalAccount.status,
        statusAfter: outreachData.statusAfter,
        source: "manual",
        activityKind: "outreach",
        countsAsContact: true,
        nextActionType: outreachData.nextActionType,
      });
    } catch {
      showActionFeedback("Couldn't save that outreach entry.", "error");
      return;
    }

    const response = await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab: inboxModalAccount._tab,
        rowIndex: inboxModalAccount._rowIndex,
        newStatus: outreachData.statusAfter,
        contactDate: todayISO(),
        nextSteps: outreachData.note,
      }),
    });

    if (!response.ok) {
      showActionFeedback("Outreach logged, but the account failed to update.", "error");
      return;
    }

    await fetchAllTabs();
    const res = await fetch("/api/activity", { cache: "no-store" });
    if (res.ok) setServerLogs(await res.json());
    setInboxModalAccount(null);
    showActionFeedback("Outreach logged.", "success");
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const followUpQueue = buildFollowUpQueue(data, mergedLogs);
  const dueToday = followUpQueue.filter((item) => item.bucket === "today");
  const dueTomorrow = followUpQueue.filter((item) => item.bucket === "tomorrow");
  const overdue = followUpQueue.filter((item) => item.bucket === "overdue");
  const upcoming = followUpQueue.filter((item) => item.bucket === "upcoming").slice(0, 5);

  // Backburner resurfaces
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hasFutureScheduledFollowUp = (account: AnyAccount) =>
    mergedLogs.some((log) => {
      if (!log.follow_up_date || !matchesAccountIdentity(log, account)) return false;
      const followUpDate = parseAppDate(log.follow_up_date);
      if (!followUpDate) return false;
      followUpDate.setHours(0, 0, 0, 0);
      return followUpDate.getTime() > today.getTime();
    });
  const backburnerResurfaces = getAllAccounts(data).filter((account) => {
    if (account.status !== "Backburner") return false;
    if (hasFutureScheduledFollowUp(account)) return false;
    const fuRaw = mergedLogs
      .filter((l) => getAccountPrimaryId(account) === l.account_id && l.follow_up_date)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      ?.follow_up_date;
    if (!fuRaw) return false;
    const fuDate = parseAppDate(fuRaw);
    if (!fuDate) return false;
    fuDate.setHours(0, 0, 0, 0);
    return fuDate.getTime() <= today.getTime();
  });

  // Backburner check-in: 60+ days dormant with no scheduled resurface
  const BACKBURNER_CHECKIN_DAYS = 60;
  const backburnerCheckIn = getAllAccounts(data)
    .filter((account) => {
      if (account.status !== "Backburner") return false;
      if (hasFutureScheduledFollowUp(account)) return false;
      if (backburnerResurfaces.some((r) => getAccountPrimaryId(r) === getAccountPrimaryId(account))) return false;
      const lastContact = contactActivityMap[getAccountPrimaryId(account)];
      const lastTouchStr = lastContact?.created_at || account.contactDate;
      return daysSince(lastTouchStr) >= BACKBURNER_CHECKIN_DAYS;
    })
    .sort((a, b) => {
      const dA = daysSince(contactActivityMap[getAccountPrimaryId(a)]?.created_at || a.contactDate);
      const dB = daysSince(contactActivityMap[getAccountPrimaryId(b)]?.created_at || b.contactDate);
      return dB - dA;
    });

  // Tasting Complete with no orders — hottest pipeline
  const allProspects = getAllAccounts(data).filter(
    (a) => a._tab !== "Active Accounts"
  ) as AnyAccount[];
  const tastingNoOrder = allProspects.filter(
    (a) => a.status === "Tasting Complete" && !hasFutureScheduledFollowUp(a)
  );

  // Sample sent 5+ days with no feedback (still at Sample Sent)
  const sampleStalledFeedback = allProspects.filter((account) => {
    if (account.status !== "Sample Sent") return false;
    if (hasFutureScheduledFollowUp(account)) return false;
    const lastContact = contactActivityMap[getAccountPrimaryId(account)];
    const lastTouchDate = lastContact?.created_at || account.contactDate;
    return daysSince(lastTouchDate) >= 5;
  });

  // Stale active accounts (Active Accounts tab)
  const staleActiveDeals = data.activeAccounts
    .filter((account) => !hasFutureScheduledFollowUp(account))
    .map((account) => {
      const latestContact = contactActivityMap[getAccountPrimaryId(account)];
      const lastTouch = latestContact?.created_at || account.contactDate;
      return { account, days: daysSince(lastTouch) };
    })
    .filter((e) => e.days >= 7)
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);

  const actionInboxItems: ActionInboxItem[] = [
    ...overdue.map((item) => ({
      id: `overdue_${getAccountPrimaryId(item.account)}`,
      account: item.account,
      label: "Overdue",
      detail: item.reason,
      meta: formatInboxDate(item.followUpDate),
      color: "#ff4f9f",
      priority: 100,
      logId: item.logId,
      followUpDate: item.followUpDate,
    })),
    ...dueToday.map((item) => ({
      id: `today_${getAccountPrimaryId(item.account)}`,
      account: item.account,
      label: "Today",
      detail: item.reason,
      meta: formatInboxDate(item.followUpDate),
      color: "#64f5ea",
      priority: 90,
      logId: item.logId,
      followUpDate: item.followUpDate,
    })),
    ...dueTomorrow.map((item) => ({
      id: `tomorrow_${getAccountPrimaryId(item.account)}`,
      account: item.account,
      label: "Tomorrow",
      detail: item.reason,
      meta: formatInboxDate(item.followUpDate),
      color: "#a78bfa",
      priority: 85,
      logId: item.logId,
      followUpDate: item.followUpDate,
    })),
    ...tastingNoOrder.map((account) => ({
      id: `tasting_${getAccountPrimaryId(account)}`,
      account,
      label: "Close",
      detail: account.nextSteps || "Tasting complete. Push for decision.",
      meta: account.contactName || account.type || account._tab,
      color: "#a78bfa",
      priority: 80,
    })),
    ...sampleStalledFeedback.map((account) => {
      const lastContact = contactActivityMap[getAccountPrimaryId(account)];
      const days = daysSince(lastContact?.created_at || account.contactDate);
      return {
        id: `sample_${getAccountPrimaryId(account)}`,
        account,
        label: "Feedback",
        detail: "Sample out 5+ days. Ask what they thought and move toward decision.",
        meta: `${days}d since sample`,
        color: "#64f5ea",
        priority: 70,
      };
    }),
    ...backburnerResurfaces.map((account) => ({
      id: `resurface_${getAccountPrimaryId(account)}`,
      account,
      label: "Resurface",
      detail: account.nextSteps || "Backburner date hit. Re-evaluate and reach out.",
      meta: account.contactName || account.type || account._tab,
      color: "#8c7fbd",
      priority: 60,
    })),
    ...staleActiveDeals.map(({ account, days }) => ({
      id: `active_${getAccountPrimaryId(account)}`,
      account,
      label: "Active",
      detail: account.nextSteps || "Current account has gone quiet.",
      meta: `${days}d since touch`,
      color: "#ffb321",
      priority: 50,
    })),
	    ...backburnerCheckIn.slice(0, 4).map((account) => {
	      const lastContact = contactActivityMap[getAccountPrimaryId(account)];
	      const days = daysSince(lastContact?.created_at || account.contactDate);
	      return {
	        id: `checkin_${getAccountPrimaryId(account)}`,
        account,
        label: "Check In",
        detail: account.nextSteps || "Quiet for 60+ days. Decide whether to revive or leave parked.",
        meta: `${days}d quiet`,
        color: "#8c7fbd",
	        priority: 40,
	      };
	    }),
  ];

  const actionInbox = actionInboxItems.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (new Date(a.followUpDate ?? 0).getTime() || 0) - (new Date(b.followUpDate ?? 0).getTime() || 0);
  }).slice(0, 12);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black uppercase tracking-[0.1em] text-rs-gold sm:text-3xl">
          Dashboard
        </h2>
        <div className="mt-1 text-sm text-[#af9fe6]">{todayLabel}</div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {/* Left column */}
        <div className="space-y-4">

          {/* Action inbox */}
          <Section
            title="Action Inbox"
            subtitle="One compact queue for follow-ups, samples, tasting closes, resurfaces, and stale active accounts."
          >
            <div className="grid gap-3 md:grid-cols-4">
              <MetricCard
                label="Urgent"
                value={String(overdue.length)}
                accent="#ff4f9f"
              />
              <MetricCard
                label="Due Today"
                value={String(dueToday.length + tastingNoOrder.length + sampleStalledFeedback.length)}
                accent="#64f5ea"
              />
              <MetricCard
                label="Tomorrow"
                value={String(dueTomorrow.length)}
                accent="#a78bfa"
              />
              <MetricCard
                label="Watch"
                value={String(upcoming.length + backburnerResurfaces.length + staleActiveDeals.length)}
                accent="#8c7fbd"
              />
            </div>
            <ActionInbox
              items={actionInbox}
              onLog={setInboxModalAccount}
              onSnooze={handleSnoozeFollowUp}
              onDone={handleDoneFollowUp}
            />
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Hit List */}
          <Section
            title="Hit List"
            subtitle="Accounts most urgently needing a touch today."
          >
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner />
              </div>
            ) : (
              <HitList items={hitList.slice(0, 8)} />
            )}
          </Section>
        </div>
      </div>

      {inboxModalAccount && (
        <LogOutreachModal
          account={inboxModalAccount}
          onClose={() => setInboxModalAccount(null)}
          onSubmit={handleInboxOutreach}
        />
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">{title}</div>
        <div className="mt-1 text-sm text-[#d8ccfb]">{subtitle}</div>
      </div>
      {children}
    </Card>
  );
}

function MetricCard({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: string;
  href?: string;
  accent?: string;
}) {
  const className = "rounded-2xl border border-rs-border/70 bg-white/5 p-4 transition-colors hover:border-rs-gold/40 hover:bg-white/10";
  const content = (
    <>
      <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">{label}</div>
      <div
        className="mt-2 text-3xl font-black"
        style={{ color: accent ?? "#fff4e8" }}
      >
        {value}
      </div>
    </>
  );

  if (!href) return <div className={className}>{content}</div>;
  return <Link href={href} className={className}>{content}</Link>;
}

function formatInboxDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function snoozeDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function ActionInbox({
  items,
  onLog,
  onSnooze,
  onDone,
}: {
  items: ActionInboxItem[];
  onLog: (account: AnyAccount) => void;
  onSnooze: (logId: string, newDate: string) => Promise<void>;
  onDone: (logId: string) => Promise<void>;
}) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-rs-border/60 bg-black/10 px-3 py-4 text-sm text-[#d8ccfb]">
        Nothing needs attention right now.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-rs-border/60 bg-black/10 px-3 py-2.5 transition-colors hover:border-rs-gold/40 hover:bg-white/5"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-1 h-9 w-1.5 shrink-0 rounded-full" style={{ background: item.color }} />
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Link
                    href={`/accounts/${item.account._tabSlug}/${item.account._rowIndex}`}
                    className="truncate font-semibold text-rs-cream hover:text-rs-gold"
                  >
                    {item.account.account}
                  </Link>
                  <span
                    className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                    style={{
                      borderColor: `${item.color}66`,
                      backgroundColor: `${item.color}18`,
                      color: item.color,
                    }}
                  >
                    {item.label}
                  </span>
                  {item.meta && <span className="truncate text-xs text-[#af9fe6]">{item.meta}</span>}
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-[#d8ccfb]">{item.detail}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:justify-end">
              {item.logId && (
                <>
                  <button
                    type="button"
                    onClick={() => onDone(item.logId!)}
                    className="rounded-lg border border-rs-border/60 bg-white/5 px-2 py-1 text-[11px] font-semibold text-[#af9fe6] transition-colors hover:border-emerald-300/40 hover:text-emerald-200"
                  >
                    Done
                  </button>
                  {[
                    { label: "+1D", days: 1 },
                    { label: "+2D", days: 2 },
                    { label: "+1W", days: 7 },
                  ].map(({ label, days }) => (
                    <button
                      key={`${item.id}_${label}`}
                      type="button"
                      onClick={() => onSnooze(item.logId!, snoozeDate(days))}
                      className="rounded-lg border border-rs-border/60 bg-white/5 px-2 py-1 text-[11px] font-semibold text-[#af9fe6] transition-colors hover:border-rs-gold/50 hover:text-rs-gold"
                    >
                      {label}
                    </button>
                  ))}
                </>
              )}
              <button
                type="button"
                onClick={() => onLog(item.account)}
                className="rounded-lg border border-rs-cyan/40 bg-rs-cyan/10 px-2.5 py-1 text-[11px] font-semibold text-rs-cyan transition-colors hover:bg-rs-cyan/20"
              >
                Log
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
