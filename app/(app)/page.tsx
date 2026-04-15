"use client";

import { useEffect, useMemo, useState } from "react";
import { useSheetStore } from "@/stores/useSheetStore";
import { useOutreachStore } from "@/stores/useOutreachStore";
import { HitList } from "@/components/features/dashboard/HitList";
import { RecentActivity } from "@/components/features/dashboard/RecentActivity";
import { PipelineSummaryBar } from "@/components/layout/PipelineSummaryBar";
import { buildHitList, HitListItem } from "@/lib/dashboard/prioritizer";
import { getStatusCounts } from "@/lib/commission/calculator";
import { ActivityLog, ActionType } from "@/types/activity";
import { Spinner } from "@/components/ui/Spinner";

export default function DashboardPage() {
  const { data } = useSheetStore();
  const outreachStore = useOutreachStore();
  const [hitList, setHitList] = useState<HitListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Build activity map from local store (always available, works without Supabase)
  const localActivityMap = useMemo<Record<string, ActivityLog>>(() => {
    const map: Record<string, ActivityLog> = {};
    for (const e of outreachStore.entries) {
      if (!map[e.account_id]) {
        const parts = e.account_id.split("_");
        const rowIndex = parseInt(parts[parts.length - 1], 10);
        map[e.account_id] = {
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
          source: "local",
          created_at: e.created_at,
        };
      }
    }
    return map;
  }, [outreachStore.entries]);

  useEffect(() => {
    if (!data) return;
    const currentData = data;

    async function loadHitList() {
      try {
        const res = await fetch("/api/activity");
        const serverLogs: ActivityLog[] = res.ok ? await res.json() : [];

        // Merge server logs + local logs (server takes precedence per account)
        const activityMap: Record<string, ActivityLog> = { ...localActivityMap };
        for (const log of serverLogs) {
          // Server data wins for same account (more authoritative)
          if (!activityMap[log.account_id] ||
              new Date(log.created_at) > new Date(activityMap[log.account_id].created_at)) {
            activityMap[log.account_id] = log;
          }
        }

        const items = buildHitList(currentData, activityMap);
        setHitList(items);
      } catch {
        setHitList(buildHitList(currentData, localActivityMap));
      }
      setLoading(false);
    }

    loadHitList();
  }, [data, localActivityMap]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const counts = getStatusCounts(data);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.4em] text-rs-sunset/85 mb-2">
          Daily Action Dashboard
        </div>
        <h2 className="mb-1 text-2xl font-black uppercase tracking-[0.14em] text-rs-gold sm:text-3xl">
          Today&apos;s Hit List
        </h2>
        <p className="max-w-2xl text-sm text-[#d8ccfb]">
          Accounts that need a touchpoint today, ranked by urgency and next step timing
        </p>
      </div>

      <PipelineSummaryBar counts={counts} />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <HitList items={hitList} />
      )}

      <RecentActivity entries={outreachStore.entries} />
    </div>
  );
}
