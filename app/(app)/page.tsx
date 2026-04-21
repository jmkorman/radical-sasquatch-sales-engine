"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useSheetStore } from "@/stores/useSheetStore";
import { FollowUpQueue, buildFollowUpQueue } from "@/components/features/dashboard/FollowUpQueue";
import { PipelineSummaryBar } from "@/components/layout/PipelineSummaryBar";
import { buildHitList, HitListItem } from "@/lib/dashboard/prioritizer";
import { getStatusCounts } from "@/lib/commission/calculator";
import { ActivityLog } from "@/types/activity";
import { AnyAccount } from "@/types/accounts";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { daysSince, parseAppDate } from "@/lib/utils/dates";
import { buildLatestContactMapByAccount, getAllAccounts } from "@/lib/activity/timeline";
import { getAccountPrimaryId } from "@/lib/accounts/identity";
import { HitList } from "@/components/features/dashboard/HitList";

export default function DashboardPage() {
  const { data } = useSheetStore();
  const [hitList, setHitList] = useState<HitListItem[]>([]);
  const [serverLogs, setServerLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const counts = getStatusCounts(data);
  const followUpQueue = buildFollowUpQueue(data, mergedLogs);
  const dueToday = followUpQueue.filter((item) => item.bucket === "today");
  const overdue = followUpQueue.filter((item) => item.bucket === "overdue");
  const upcoming = followUpQueue.filter((item) => item.bucket === "upcoming").slice(0, 5);

  // Backburner resurfaces
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const backburnerResurfaces = getAllAccounts(data).filter((account) => {
    if (account.status !== "Backburner") return false;
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

  // Tasting Complete with no orders — hottest pipeline
  const allProspects = getAllAccounts(data).filter(
    (a) => a._tab !== "Active Accounts"
  ) as AnyAccount[];
  const tastingNoOrder = allProspects.filter(
    (a) => a.status === "Tasting Complete"
  );

  // Sample sent 5+ days with no feedback (still at Sample Sent)
  const sampleStalledFeedback = allProspects.filter((account) => {
    if (account.status !== "Sample Sent") return false;
    const lastContact = contactActivityMap[getAccountPrimaryId(account)];
    const lastTouchDate = lastContact?.created_at || account.contactDate;
    return daysSince(lastTouchDate) >= 5;
  });

  // Stale active accounts (Active Accounts tab)
  const staleActiveDeals = data.activeAccounts
    .map((account) => {
      const latestContact = contactActivityMap[getAccountPrimaryId(account)];
      const lastTouch = latestContact?.created_at || account.contactDate;
      return { account, days: daysSince(lastTouch) };
    })
    .filter((e) => e.days >= 7)
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);

  // Quick wins: Identified/Researched accounts with a contact name but no outreach
  const quickWins = allProspects
    .filter(
      (a) =>
        (a.status === "Identified" || a.status === "Researched") &&
        Boolean(a.contactName) &&
        !contactActivityMap[getAccountPrimaryId(a)]
    )
    .slice(0, 5);

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

      <PipelineSummaryBar counts={counts} />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {/* Left column */}
        <div className="space-y-4">

          {/* Overdue + Today's follow-ups */}
          <Section
            title="Today's Queue"
            subtitle="Follow-ups due today or overdue — work these first."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard
                label="Overdue"
                value={String(overdue.length)}
                accent="#ff4f9f"
              />
              <MetricCard
                label="Due Today"
                value={String(dueToday.length)}
                accent="#64f5ea"
              />
              <MetricCard
                label="Upcoming"
                value={String(upcoming.length)}
                accent="#8c7fbd"
              />
            </div>
            {followUpQueue.length > 0 && (
              <FollowUpQueue
                items={[...overdue, ...dueToday, ...upcoming]}
                onSnooze={handleSnoozeFollowUp}
              />
            )}
            {followUpQueue.length === 0 && (
              <div className="rounded-xl border border-rs-border/60 bg-black/10 px-3 py-4 text-sm text-[#d8ccfb]">
                No follow-ups scheduled right now.
              </div>
            )}
          </Section>

          {/* Tasting Complete — hottest pipeline */}
          {tastingNoOrder.length > 0 && (
            <Section
              title="Tasting Complete — Close Them"
              subtitle="They've tried the product. Every day without a decision is a lost sale."
            >
              <SimpleAccountList
                items={tastingNoOrder.map((a) => ({
                  href: `/accounts/${a._tabSlug}/${a._rowIndex}`,
                  title: a.account,
                  meta: a.contactName || a.type,
                  detail: a.nextSteps || "No next step — add one now",
                  accentColor: "#a78bfa",
                }))}
                empty="No accounts in Tasting Complete."
              />
            </Section>
          )}

          {/* Sample Sent — need feedback */}
          {sampleStalledFeedback.length > 0 && (
            <Section
              title="Sample Sent — Get Feedback"
              subtitle="Sample out 5+ days with no feedback. Call to check in."
            >
              <SimpleAccountList
                items={sampleStalledFeedback.map((a) => {
                  const lastContact = contactActivityMap[getAccountPrimaryId(a)];
                  const days = daysSince(lastContact?.created_at || a.contactDate);
                  return {
                    href: `/accounts/${a._tabSlug}/${a._rowIndex}`,
                    title: a.account,
                    meta: `${days}d since sample`,
                    detail: a.contactName || a.type,
                    accentColor: "#64f5ea",
                  };
                })}
                empty="No stalled samples."
              />
            </Section>
          )}

          {/* Backburner resurfaces */}
          {backburnerResurfaces.length > 0 && (
            <Section
              title="Resurface Today"
              subtitle="Backburner accounts whose wait period has ended — time to re-engage."
            >
              <SimpleAccountList
                items={backburnerResurfaces.map((a) => ({
                  href: `/accounts/${a._tabSlug}/${a._rowIndex}`,
                  title: a.account,
                  meta: a.contactName || a.type,
                  detail: a.nextSteps || "Re-evaluate and reach out",
                  accentColor: "#8c7fbd",
                }))}
                empty="No backburner resurfaces today."
              />
            </Section>
          )}

          {/* Stale active accounts */}
          {staleActiveDeals.length > 0 && (
            <Section
              title="Stale Active Deals"
              subtitle="Current customers with no contact in 7+ days."
            >
              <SimpleAccountList
                items={staleActiveDeals.map(({ account, days }) => ({
                  href: `/accounts/${account._tabSlug}/${account._rowIndex}`,
                  title: account.account,
                  meta: `${days}d since last contact`,
                  detail: account.nextSteps || "No next step logged",
                }))}
                empty="No stale active deals right now."
              />
            </Section>
          )}
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

          {/* Quick wins */}
          {quickWins.length > 0 && (
            <Section
              title="Quick Wins"
              subtitle="Identified/researched accounts with a contact — just haven't reached out yet."
            >
              <SimpleAccountList
                items={quickWins.map((a) => ({
                  href: `/accounts/${a._tabSlug}/${a._rowIndex}`,
                  title: a.account,
                  meta: a.contactName,
                  detail: a.nextSteps || `${a.type}${("location" in a && a.location) ? ` · ${a.location}` : ""}`,
                }))}
                empty="No quick wins at the moment."
              />
            </Section>
          )}
        </div>
      </div>
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

function SimpleAccountList({
  items,
  empty,
}: {
  items: { href: string; title: string; meta: string; detail: string; accentColor?: string }[];
  empty: string;
}) {
  if (!items.length) {
    return <div className="rounded-xl border border-rs-border/60 bg-black/10 px-3 py-4 text-sm text-[#d8ccfb]">{empty}</div>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Link
          key={`${item.href}_${item.title}`}
          href={item.href}
          className="block rounded-xl border border-rs-border/60 bg-black/10 px-3 py-3 transition-colors hover:border-rs-gold/40 hover:bg-white/5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-rs-cream">{item.title}</div>
            <div
              className="text-xs whitespace-nowrap"
              style={{ color: item.accentColor ?? "#64f5ea" }}
            >
              {item.meta}
            </div>
          </div>
          <div className="mt-1 text-sm text-[#d8ccfb] truncate">{item.detail}</div>
        </Link>
      ))}
    </div>
  );
}
