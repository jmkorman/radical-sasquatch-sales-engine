"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useSheetStore } from "@/stores/useSheetStore";
import { useOutreachStore } from "@/stores/useOutreachStore";
import { HitList } from "@/components/features/dashboard/HitList";
import { FollowUpQueue, buildFollowUpQueue } from "@/components/features/dashboard/FollowUpQueue";
import { RecentActivity } from "@/components/features/dashboard/RecentActivity";
import { PipelineSummaryBar } from "@/components/layout/PipelineSummaryBar";
import { buildHitList, HitListItem } from "@/lib/dashboard/prioritizer";
import { getStatusCounts } from "@/lib/commission/calculator";
import { ActivityLog, ActionType } from "@/types/activity";
import { OrderRecord } from "@/types/orders";
import { Spinner } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { formatDateShort, daysSince } from "@/lib/utils/dates";
import { countsAsContact } from "@/lib/activity/helpers";

function orderPotential(value: string) {
  return parseFloat((value || "").replace(/[^0-9.]/g, "")) || 0;
}

export default function DashboardPage() {
  const { data } = useSheetStore();
  const outreachStore = useOutreachStore();
  const [hitList, setHitList] = useState<HitListItem[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [serverLogs, setServerLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const localLogs = useMemo<ActivityLog[]>(() => {
    return outreachStore.entries.map((e) => {
      const parts = e.account_id.split("_");
      const rowIndex = parseInt(parts[parts.length - 1], 10);
      return {
        id: e.id,
        account_id: e.account_id,
        tab: e.tab,
        row_index: rowIndex,
        account_name: e.account_name,
        action_type: e.action_type as ActionType,
        note: e.note || null,
        status_before: e.status_before || null,
        status_after: e.status_after || null,
        follow_up_date: e.follow_up_date,
        notion_task_id: null,
        source: e.source ?? "local",
        created_at: e.created_at,
        activity_kind: e.activity_kind,
        counts_as_contact: e.counts_as_contact,
      };
    });
  }, [outreachStore.entries]);

  const mergedLogs = useMemo<ActivityLog[]>(() => {
    const byId = new Map<string, ActivityLog>();
    [...serverLogs, ...localLogs].forEach((log) => {
      if (!byId.has(log.id)) {
        byId.set(log.id, log);
      }
    });
    return [...byId.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [localLogs, serverLogs]);

  const contactActivityMap = useMemo<Record<string, ActivityLog>>(() => {
    const map: Record<string, ActivityLog> = {};
    for (const log of mergedLogs) {
      if (!map[log.account_id] && getLatestContactLog([log])) {
        map[log.account_id] = log;
      }
    }
    return map;
  }, [mergedLogs]);

  useEffect(() => {
    if (!data) return;

    async function loadDashboardData() {
      try {
        const [activityRes, orderRes] = await Promise.all([
          fetch("/api/activity"),
          fetch("/api/orders"),
        ]);
        const activityData: ActivityLog[] = activityRes.ok ? await activityRes.json() : [];
        const orderData: OrderRecord[] = orderRes.ok ? await orderRes.json() : [];
        setServerLogs(activityData);
        setOrders(orderData);
        setHitList(buildHitList(data, buildLatestContactMap([...activityData, ...localLogs])));
      } catch {
        setHitList(buildHitList(data, buildLatestContactMap(localLogs)));
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [data, localLogs]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const counts = getStatusCounts(data);
  const followUpQueue = buildFollowUpQueue(data, buildLatestContactMap(mergedLogs));
  const activeDeals = data.activeAccounts.filter((account) => account.status !== "Closed - Won");
  const staleActiveDeals = [...activeDeals]
    .map((account) => {
      const accountId = `${account._tabSlug}_${account._rowIndex}`;
      const latestContact = contactActivityMap[accountId];
      const lastTouch = latestContact?.created_at || account.contactDate;
      return {
        account,
        days: daysSince(lastTouch),
        value: orderPotential(account.order),
      };
    })
    .filter((entry) => entry.days >= 7)
    .sort((a, b) => b.days - a.days || b.value - a.value)
    .slice(0, 5);

  const quickWins = [
    ...data.restaurants,
    ...data.retail,
    ...data.catering,
    ...data.foodTruck,
  ]
    .filter(
      (account) =>
        account.status === "Researched" &&
        Boolean(account.contactName) &&
        Boolean(account.nextSteps) &&
        !contactActivityMap[`${account._tabSlug}_${account._rowIndex}`]
    )
    .slice(0, 5);

  const blockedDeals = activeDeals
    .filter((account) => !account.contactName || !account.nextSteps || (!account.email && !account.phone))
    .slice(0, 5);

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())
    .slice(0, 5);

  const buyingAccounts = new Set(orders.map((order) => order.account_id)).size;
  const orderTotal = orders.reduce((sum, order) => sum + order.amount, 0);
  const dueToday = followUpQueue.filter((item) => item.bucket === "today");
  const overdue = followUpQueue.filter((item) => item.bucket === "overdue");
  const upcoming = followUpQueue.filter((item) => item.bucket === "upcoming").slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.4em] text-rs-sunset/85">
          Daily Action Dashboard
        </div>
        <h2 className="mb-1 text-2xl font-black uppercase tracking-[0.14em] text-rs-gold sm:text-3xl">
          Today&apos;s Control Center
        </h2>
        <p className="max-w-2xl text-sm text-[#d8ccfb]">
          Focus on follow-ups, stale deals, blockers, and revenue signals instead of browsing the whole pipeline.
        </p>
      </div>

      <PipelineSummaryBar counts={counts} />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <Section title="Today&apos;s Follow-Ups" subtitle="What needs action now or soon.">
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard label="Overdue" value={String(overdue.length)} />
              <MetricCard label="Due Today" value={String(dueToday.length)} />
              <MetricCard label="Upcoming" value={String(upcoming.length)} />
            </div>
            <FollowUpQueue items={[...overdue, ...dueToday, ...upcoming]} />
          </Section>

          <Section title="Stale Active Deals" subtitle="Active deals with no real outreach in 7+ days.">
            <SimpleAccountList
              items={staleActiveDeals.map((entry) => ({
                href: `/accounts/${entry.account._tabSlug}/${entry.account._rowIndex}`,
                title: entry.account.account,
                meta: `${entry.days}d since last contact`,
                detail: entry.account.nextSteps || "No next step logged",
              }))}
              empty="No stale active deals right now."
            />
          </Section>

          <Section title="Quick Wins" subtitle="Researched accounts with a named contact and next step, but no outreach yet.">
            <SimpleAccountList
              items={quickWins.map((account) => ({
                href: `/accounts/${account._tabSlug}/${account._rowIndex}`,
                title: account.account,
                meta: account.contactName,
                detail: account.nextSteps,
              }))}
              empty="No quick wins at the moment."
            />
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Revenue Pulse" subtitle="Recent orders and buying-account momentum.">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Recent Purchase Total" value={`$${orderTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
              <MetricCard label="Buying Accounts" value={String(buyingAccounts)} />
            </div>
            <SimpleAccountList
              items={recentOrders.map((order) => ({
                href: `/accounts/${order.tab}/${order.account_id.split("_").at(-1)}`,
                title: order.account_name,
                meta: formatDateShort(order.order_date),
                detail: `$${order.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}${order.notes ? ` · ${order.notes}` : ""}`,
              }))}
              empty="No orders logged yet."
            />
          </Section>

          <Section title="Blocked Deals" subtitle="Missing contact data or next-step hygiene.">
            <SimpleAccountList
              items={blockedDeals.map((account) => ({
                href: `/accounts/${account._tabSlug}/${account._rowIndex}`,
                title: account.account,
                meta: account.contactName || "Missing contact",
                detail: !account.nextSteps
                  ? "Missing next step"
                  : !account.email && !account.phone
                    ? "Missing email and phone"
                    : account.nextSteps,
              }))}
              empty="No blocked deals right now."
            />
          </Section>

          <Section title="Hit List" subtitle="Urgent accounts that still need a touchpoint today.">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner />
              </div>
            ) : (
              <HitList items={hitList.slice(0, 6)} />
            )}
          </Section>
        </div>
      </div>

      <RecentActivity entries={outreachStore.entries} />
    </div>
  );
}

function buildLatestContactMap(logs: ActivityLog[]): Record<string, ActivityLog> {
  const map: Record<string, ActivityLog> = {};
  const sorted = [...logs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  for (const log of sorted) {
    if (!map[log.account_id] && countsAsContact(log)) {
      map[log.account_id] = log;
    }
  }
  return map;
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-rs-border/70 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">{label}</div>
      <div className="mt-2 text-3xl font-black text-rs-cream">{value}</div>
    </div>
  );
}

function SimpleAccountList({
  items,
  empty,
}: {
  items: { href: string; title: string; meta: string; detail: string }[];
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
            <div className="text-xs text-rs-gold">{item.meta}</div>
          </div>
          <div className="mt-1 text-sm text-[#d8ccfb]">{item.detail}</div>
        </Link>
      ))}
    </div>
  );
}
