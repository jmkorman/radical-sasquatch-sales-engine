"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivityLog } from "@/types/activity";
import { Card } from "@/components/ui/Card";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { ActivityLogList } from "@/components/features/accounts/ActivityLog";
import { parseActivityNote } from "@/lib/activity/notes";

const ACTION_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "call", label: "Calls" },
  { value: "email", label: "Emails" },
  { value: "in-person", label: "In-Person" },
  { value: "note", label: "Notes" },
];

function formatTabLabel(tab: string) {
  return tab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AllLogsView() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [tabFilter, setTabFilter] = useState("all");

  useEffect(() => {
    async function loadLogs() {
      try {
        const res = await fetch("/api/activity");
        if (!res.ok) throw new Error("Failed to load activity logs");
        const data: ActivityLog[] = await res.json();
        setLogs(data);
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    }

    loadLogs();
  }, []);

  const tabOptions = useMemo(() => {
    const uniqueTabs = Array.from(new Set(logs.map((log) => log.tab))).sort();
    return [
      { value: "all", label: "All pipeline tabs" },
      ...uniqueTabs.map((tab) => ({
        value: tab,
        label: formatTabLabel(tab),
      })),
    ];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return logs.filter((log) => {
      if (actionFilter !== "all" && log.action_type !== actionFilter) return false;
      if (tabFilter !== "all" && log.tab !== tabFilter) return false;

      if (!normalizedQuery) return true;

      const parsed = parseActivityNote(log.note);
      const haystack = [
        log.account_name,
        log.action_type,
        formatTabLabel(log.tab),
        parsed.summary,
        parsed.details,
        parsed.nextStep,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [actionFilter, logs, query, tabFilter]);

  const followUpsScheduled = logs.filter((log) => Boolean(log.follow_up_date)).length;
  const touchesThisWeek = logs.filter((log) => {
    const created = new Date(log.created_at).getTime();
    return Number.isFinite(created) && Date.now() - created < 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-[0.4em] text-rs-sunset/85">
          Outreach Archive
        </div>
        <h2 className="text-2xl font-black uppercase tracking-[0.14em] text-rs-gold sm:text-3xl">
          All Logs
        </h2>
        <p className="max-w-2xl text-sm text-[#d8ccfb]">
          Search every call, email, meeting, and note across the whole pipeline.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Total Entries</div>
          <div className="mt-2 text-3xl font-black text-rs-cream">{logs.length}</div>
        </Card>
        <Card>
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Touches This Week</div>
          <div className="mt-2 text-3xl font-black text-rs-cream">{touchesThisWeek}</div>
        </Card>
        <Card>
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Follow-Ups Scheduled</div>
          <div className="mt-2 text-3xl font-black text-rs-cream">{followUpsScheduled}</div>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search by account, tab, summary, next step"
          />
          <Select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            options={ACTION_OPTIONS}
          />
          <Select
            value={tabFilter}
            onChange={(e) => setTabFilter(e.target.value)}
            options={tabOptions}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-10 text-center text-[#af9fe6]">
            No logs match those filters yet.
          </div>
        ) : (
          <ActivityLogList logs={filteredLogs} />
        )}
      </Card>
    </div>
  );
}
