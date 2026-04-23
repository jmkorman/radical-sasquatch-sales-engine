"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivityLog } from "@/types/activity";
import { AnyAccount, AllTabsData } from "@/types/accounts";
import { Card } from "@/components/ui/Card";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { ActivityLogList } from "@/components/features/accounts/ActivityLog";
import { LogOutreachModal } from "@/components/features/dashboard/LogOutreachModal";
import { parseActivityNote } from "@/lib/activity/notes";
import { Button } from "@/components/ui/Button";
import { useTrashStore } from "@/stores/useTrashStore";
import { useSheetStore } from "@/stores/useSheetStore";
import { useUIStore } from "@/stores/useUIStore";
import { tryAcquireGmailPollLock, releaseGmailPollLock } from "@/lib/gmail/clientPollLock";
// deletedLogs from localStorage used only for the unloaded badge count

const ACTION_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "call", label: "Calls" },
  { value: "email", label: "Emails" },
  { value: "in-person", label: "In-Person" },
  { value: "sample-sent", label: "Samples Sent" },
  { value: "tasting-complete", label: "Tastings" },
  { value: "note", label: "Notes" },
];

function formatTabLabel(tab: string) {
  return tab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getAccountFromLog(data: AllTabsData, log: ActivityLog): AnyAccount | null {
  const tabMap: Record<string, AnyAccount[]> = {
    restaurants: data.restaurants,
    retail: data.retail,
    catering: data.catering,
    "food-truck": data.foodTruck,
    "active-accounts": data.activeAccounts,
  };
  // Normalize log.tab to slug (stored as "Restaurants", slug is "restaurants", "food-truck", etc.)
  const tabSlug = log.tab.toLowerCase().replace(/\s+/g, "-");
  const accounts = tabMap[tabSlug] ?? [];
  const byRow = accounts.find((a) => a._rowIndex === log.row_index);
  if (byRow) return byRow;
  // Fallback: match by account name across all tabs
  if (log.account_name) {
    const nameLower = log.account_name.toLowerCase();
    const all = Object.values(tabMap).flat();
    return all.find((a) => a.account?.toLowerCase() === nameLower) ?? null;
  }
  return null;
}

export function AllLogsView() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [trashLogs, setTrashLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [trashLoading, setTrashLoading] = useState(false);
  const [gmailPolling, setGmailPolling] = useState(false);
  const [pendingGmailLogs, setPendingGmailLogs] = useState<ActivityLog[]>([]);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [tabFilter, setTabFilter] = useState("all");
  const [showTrash, setShowTrash] = useState(false);
  const [editingOutreachLog, setEditingOutreachLog] = useState<ActivityLog | null>(null);
  const [editingOutreachAccount, setEditingOutreachAccount] = useState<AnyAccount | null>(null);
  const deletedLogs = useTrashStore((state) => state.deletedLogs);
  const { data } = useSheetStore();
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);
  const mergedLogs = logs;

  async function loadLogs() {
    try {
      const res = await fetch("/api/activity", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load activity logs");
      const data: ActivityLog[] = await res.json();
      setLogs(data);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleEditFollowUp(log: ActivityLog, newDate: string) {
    const res = await fetch("/api/activity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: log.id, follow_up_date: newDate }),
    });
    if (!res.ok) throw new Error("Failed to update follow-up date");
    await loadLogs();
  }

  function handleEditOutreach(log: ActivityLog) {
    if (!data) return;
    const account = getAccountFromLog(data, log);
    if (!account) return;
    setEditingOutreachLog(log);
    setEditingOutreachAccount(account);
  }

  async function handleUpdateOutreachLog(formData: {
    actionType: string;
    statusAfter: string;
    note: string;
    followUpDate: string;
    nextActionType: string;
  }) {
    if (!editingOutreachLog) return;
    const res = await fetch("/api/activity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingOutreachLog.id,
        action_type: formData.actionType,
        note: formData.note,
        status_before: editingOutreachLog.status_before,
        status_after: formData.statusAfter,
        follow_up_date: formData.followUpDate || null,
        next_action_type: formData.nextActionType || null,
        activity_kind: "outreach",
        counts_as_contact: true,
      }),
    });
    if (!res.ok) throw new Error("Failed to update outreach");
    const hadPending = pendingGmailLogs.length > 0;
    setEditingOutreachLog(null);
    setEditingOutreachAccount(null);
    showActionFeedback(
      hadPending ? `Outreach updated. ${pendingGmailLogs.length} more email${pendingGmailLogs.length === 1 ? "" : "s"} to review.` : "Outreach updated.",
      "success"
    );
    await loadLogs();
    if (hadPending) openNextGmailLog(pendingGmailLogs, data);
  }

  async function loadTrashLogs() {
    setTrashLoading(true);
    try {
      const res = await fetch("/api/activity?trash=true", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load trash logs");
      const data: ActivityLog[] = await res.json();
      setTrashLogs(data);
    } catch {
      setTrashLogs([]);
    } finally {
      setTrashLoading(false);
    }
  }

  function openNextGmailLog(remaining: ActivityLog[], allData: typeof data) {
    if (!remaining.length || !allData) return;
    const [next, ...rest] = remaining;
    const account = getAccountFromLog(allData, next);
    if (account) {
      setPendingGmailLogs(rest);
      setEditingOutreachLog(next);
      setEditingOutreachAccount(account);
    } else if (rest.length) {
      openNextGmailLog(rest, allData);
    }
  }

  async function pollGmail() {
    if (!tryAcquireGmailPollLock(true)) return; // force=true bypasses throttle for manual click
    setGmailPolling(true);
    try {
      const res = await fetch("/api/gmail/poll");
      const result: { imported?: number; importedAccounts?: string[]; skipped?: boolean; reason?: string } = await res.json();

      if (!res.ok || result.skipped) {
        showActionFeedback(result.reason ?? "Gmail not configured.", "error");
        return;
      }

      const imported = result.imported ?? 0;
      if (imported === 0) {
        showActionFeedback("No new emails found.", "success");
        return;
      }

      // Fetch fresh logs to find the newly imported ones
      const freshRes = await fetch("/api/activity", { cache: "no-store" });
      const freshLogs: ActivityLog[] = freshRes.ok ? await freshRes.json() : [];
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const newGmailLogs = freshLogs.filter(
        (log) => log.source === "gmail" && new Date(log.created_at).getTime() > fiveMinutesAgo
      );

      setLogs(freshLogs);
      showActionFeedback(
        `${imported} email${imported === 1 ? "" : "s"} imported. Add a follow-up date below.`,
        "success"
      );

      openNextGmailLog(newGmailLogs, data);
    } catch {
      showActionFeedback("Gmail poll failed.", "error");
    } finally {
      setGmailPolling(false);
      releaseGmailPollLock();
    }
  }

  useEffect(() => {
    void loadLogs();
  }, []);

  useEffect(() => {
    if (showTrash) void loadTrashLogs();
  }, [showTrash]);

  const tabOptions = useMemo(() => {
    const uniqueTabs = Array.from(new Set(mergedLogs.map((log) => log.tab))).sort();
    return [
      { value: "all", label: "All pipeline tabs" },
      ...uniqueTabs.map((tab) => ({
        value: tab,
        label: formatTabLabel(tab),
      })),
    ];
  }, [mergedLogs]);

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sourceLogs = showTrash ? trashLogs : mergedLogs;

    return sourceLogs.filter((log) => {
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
  }, [actionFilter, mergedLogs, query, showTrash, tabFilter, trashLogs]);

  const followUpsScheduled = mergedLogs.filter((log) => Boolean(log.follow_up_date)).length;
  const touchesThisWeek = mergedLogs.filter((log) => {
    const created = new Date(log.created_at).getTime();
    return Number.isFinite(created) && Date.now() - created < 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <>
    {editingOutreachLog && editingOutreachAccount && (
      <LogOutreachModal
        account={editingOutreachAccount}
        initialLog={editingOutreachLog}
        title={`Edit Outreach - ${editingOutreachAccount.account}`}
        submitLabel="Save Outreach"
        onClose={() => {
          setEditingOutreachLog(null);
          setEditingOutreachAccount(null);
          if (pendingGmailLogs.length) openNextGmailLog(pendingGmailLogs, data);
        }}
        onSubmit={handleUpdateOutreachLog}
      />
    )}
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={showTrash ? "secondary" : "primary"}
          size="sm"
          onClick={() => setShowTrash(false)}
        >
          Live Logs
        </Button>
        <Button
          variant={showTrash ? "primary" : "secondary"}
          size="sm"
          onClick={() => setShowTrash(true)}
        >
          Log Trash {showTrash ? `(${trashLogs.length})` : deletedLogs.length > 0 ? `(${deletedLogs.length})` : ""}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void pollGmail()}
          disabled={gmailPolling}
        >
          {gmailPolling ? "Checking Gmail…" : "Refresh Gmail"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Total Entries</div>
          <div className="mt-2 text-3xl font-black text-rs-cream">{mergedLogs.length}</div>
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

        {loading || (showTrash && trashLoading) ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-10 text-center text-[#af9fe6]">
            No logs match those filters yet.
          </div>
        ) : (
          <ActivityLogList
            logs={filteredLogs}
            showDeleted={showTrash}
            showAccountName
            onServerLogsChanged={showTrash ? loadTrashLogs : loadLogs}
            onEditFollowUp={handleEditFollowUp}
            onEditOutreach={handleEditOutreach}
            editAllWithOutreachModal
          />
        )}
      </Card>
    </div>
    </>
  );
}
