"use client";

import { useState, useMemo, Fragment, useEffect } from "react";
import { AnyAccount, AllTabsData, TabName } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { Tabs } from "@/components/ui/Tabs";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { STATUS_VALUES, TAB_NAMES } from "@/lib/utils/constants";
import { formatPhone } from "@/lib/utils/phone";
import { useSheetStore } from "@/stores/useSheetStore";
import { useOutreachStore } from "@/stores/useOutreachStore";
import { LogOutreachModal } from "@/components/features/dashboard/LogOutreachModal";
import { todayISO, daysSince, dateToTimestamp, parseAppDate, getContactAgeClass } from "@/lib/utils/dates";
import { parseActivityNote } from "@/lib/activity/notes";
import { getLatestActivityLogForAccount, getLatestContactLogForAccount, getLogsForAccount } from "@/lib/activity/timeline";
import { mergeActivityLogs, outreachEntriesToActivityLogs } from "@/lib/activity/local";
import { persistActivityEntry } from "@/lib/activity/persist";
import { useUIStore } from "@/stores/useUIStore";
import Link from "next/link";

const STATUS_SORT_ORDER: Record<string, number> = {
  "Following Up": 0,
  "Contacted": 1,
  "Researched": 2,
  "Identified": 3,
  "Closed - Won": 4,
  "": 5,
};

type SortBy = "status" | "name" | "stale" | "recent";

const SORT_OPTIONS: { key: SortBy; label: string; title: string }[] = [
  { key: "status", label: "Active First", title: "Following Up → Contacted → Researched → Identified" },
  { key: "stale", label: "Most Stale", title: "Oldest last-contact date first — highest re-engagement priority" },
  { key: "name", label: "A → Z", title: "Alphabetical by account name" },
  { key: "recent", label: "Recently Touched", title: "Most recently contacted first" },
];

function getAccountsForTab(data: AllTabsData, tab: TabName): AnyAccount[] {
  switch (tab) {
    case "Restaurants": return data.restaurants;
    case "Retail": return data.retail;
    case "Catering": return data.catering;
    case "Food Truck": return data.foodTruck;
  }

  return [];
}

function formatContactDate(dateStr: string): { label: string; daysAgo: number | null } {
  if (!dateStr) return { label: "—", daysAgo: null };
  const d = parseAppDate(dateStr);
  if (!d) return { label: dateStr, daysAgo: null };
  const days = daysSince(dateStr);
  let label: string;
  if (days === 0) label = "Today";
  else if (days === 1) label = "Yesterday";
  else if (days <= 7) label = `${days}d ago`;
  else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { label, daysAgo: days };
}

export function PipelineTable({ data }: { data: AllTabsData }) {
  const [activeTab, setActiveTab] = useState<TabName>("Restaurants");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("status");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modalAccount, setModalAccount] = useState<AnyAccount | null>(null);
  const [editingCell, setEditingCell] = useState<{ key: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [serverLogs, setServerLogs] = useState<ActivityLog[]>([]);
  const { fetchAllTabs } = useSheetStore();
  const outreachStore = useOutreachStore();
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);

  useEffect(() => {
    async function loadActivity() {
      try {
        const response = await fetch("/api/activity", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load activity");
        setServerLogs(await response.json());
      } catch {
        setServerLogs([]);
      }
    }

    void loadActivity();
  }, []);

  const mergedLogs = useMemo(
    () => mergeActivityLogs(outreachEntriesToActivityLogs(outreachStore.entries), serverLogs),
    [outreachStore.entries, serverLogs]
  );

  const allForTab = useMemo(() => getAccountsForTab(data, activeTab), [data, activeTab]);

  const accounts = useMemo(() => {
    let list = allForTab;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.account.toLowerCase().includes(q) ||
        a.contactName?.toLowerCase().includes(q) ||
        ("location" in a && (a.location as string)?.toLowerCase().includes(q))
      );
    }

    if (statusFilter) {
      list = list.filter(a => a.status === statusFilter);
    }

    return [...list].sort((a, b) => {
      const aLastTouch = getLatestContactLogForAccount(mergedLogs, a)?.created_at || a.contactDate;
      const bLastTouch = getLatestContactLogForAccount(mergedLogs, b)?.created_at || b.contactDate;

      if (sortBy === "name") return a.account.localeCompare(b.account);

      if (sortBy === "stale") {
        const aT = dateToTimestamp(aLastTouch);
        const bT = dateToTimestamp(bLastTouch);
        return aT - bT; // oldest first = most stale
      }

      if (sortBy === "recent") {
        const aT = dateToTimestamp(aLastTouch);
        const bT = dateToTimestamp(bLastTouch);
        return bT - aT;
      }

      // Default "status": active stages first, then stale-first within same stage
      const aOrder = STATUS_SORT_ORDER[a.status] ?? 5;
      const bOrder = STATUS_SORT_ORDER[b.status] ?? 5;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const aT = dateToTimestamp(aLastTouch);
      const bT = dateToTimestamp(bLastTouch);
      return aT - bT;
    });
  }, [allForTab, mergedLogs, search, statusFilter, sortBy]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of allForTab) {
      const s = a.status || "(none)";
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [allForTab]);

  const handleStatusChange = async (account: AnyAccount, newStatus: string) => {
    const response = await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab: account._tab,
        rowIndex: account._rowIndex,
        newStatus,
        expectedValues: {
          newStatus: account.status || "",
        },
      }),
    });
    if (response.status === 409) {
      await fetchAllTabs();
      showActionFeedback("That pipeline row changed before the status update saved. I refreshed the latest data.", "error");
      return;
    }
    if (!response.ok) {
      showActionFeedback("Couldn’t update the pipeline status.", "error");
      return;
    }
    await fetchAllTabs();
    showActionFeedback("Pipeline status updated.", "success");
  };

  const handleFieldEdit = async (account: AnyAccount, field: string, value: string) => {
    const payload: Record<string, any> = {
      tab: account._tab,
      rowIndex: account._rowIndex,
      expectedValues: {},
    };

    if (field === "CONTACT_NAME") {
      payload.contactName = value;
      payload.expectedValues.contactName = account.contactName || "";
    } else if (field === "EMAIL") {
      payload.email = value;
      payload.expectedValues.email = account.email || "";
    } else if (field === "PHONE") {
      payload.phone = value;
      payload.expectedValues.phone = account.phone || "";
    }

    const response = await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 409) {
      setEditingCell(null);
      setEditValue("");
      await fetchAllTabs();
      showActionFeedback("That field changed before your edit saved. I refreshed the latest row.", "error");
      return;
    }

    if (!response.ok) {
      showActionFeedback("Couldn’t save that pipeline field.", "error");
      return;
    }

    setEditingCell(null);
    setEditValue("");
    await fetchAllTabs();
    showActionFeedback("Pipeline field updated.", "success");
  };

  const handleSubmitOutreach = async (outreachData: {
    actionType: string; statusAfter: string; note: string; followUpDate: string;
  }) => {
    if (!modalAccount) return;
    const { log, persistedRemotely } = await persistActivityEntry({
      account: modalAccount,
      actionType: outreachData.actionType,
      note: outreachData.note,
      followUpDate: outreachData.followUpDate || null,
      statusBefore: modalAccount.status,
      statusAfter: outreachData.statusAfter,
      source: "manual",
      activityKind: "outreach",
      countsAsContact: true,
    });

    if (persistedRemotely) {
      setServerLogs((existing) => mergeActivityLogs([log], existing));
    }

    const response = await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab: modalAccount._tab,
        rowIndex: modalAccount._rowIndex,
        newStatus: outreachData.statusAfter,
        contactDate: todayISO(),
        nextSteps: outreachData.note,
        expectedValues: {
          newStatus: modalAccount.status || "",
          nextSteps: modalAccount.nextSteps || "",
        },
      }),
    });

    if (response.status === 409) {
      await fetchAllTabs();
      showActionFeedback("That account changed before this outreach saved to the sheet. I refreshed the latest data.", "error");
      return;
    }

    if (!response.ok) {
      showActionFeedback(
        persistedRemotely
          ? "Outreach saved, but the pipeline row failed to update."
          : "Outreach saved locally, but the pipeline row failed to update.",
        "error"
      );
      return;
    }

    if (outreachData.followUpDate) {
      void fetch("/api/notion/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: modalAccount.account,
          contactName: modalAccount.contactName ?? "",
          followUpDate: outreachData.followUpDate,
          accountUrl: `${window.location.origin}/accounts/${modalAccount._tabSlug}/${modalAccount._rowIndex}`,
        }),
      }).catch(() => {});
    }

    await fetchAllTabs();
    setModalAccount(null);
    showActionFeedback(
      persistedRemotely
        ? "Pipeline outreach logged."
        : "Pipeline outreach saved locally. Cloud sync can retry later.",
      persistedRemotely ? "success" : "info"
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Tabs
        tabs={TAB_NAMES.filter(t => t !== "Active Accounts")}
        activeTab={activeTab}
        onChange={(t) => { setActiveTab(t as TabName); setExpanded(null); setStatusFilter(""); }}
      />

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("")}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
            statusFilter === ""
              ? "bg-rs-gold/15 text-rs-gold border border-rs-gold/40"
              : "text-gray-500 border border-rs-border/40 hover:border-rs-border hover:text-gray-300"
          }`}
        >
          All ({allForTab.length})
        </button>
        {Object.entries(statusCounts)
          .sort(([a], [b]) => (STATUS_SORT_ORDER[a] ?? 5) - (STATUS_SORT_ORDER[b] ?? 5))
          .map(([status, count]) => {
            const val = status === "(none)" ? "" : status;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(statusFilter === val ? "" : val)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all ${
                  statusFilter === val && val !== ""
                    ? "ring-2 ring-rs-gold ring-offset-1 ring-offset-rs-bg"
                    : "hover:opacity-80"
                }`}
              >
                <Badge status={val} />
                <span className="text-gray-300 font-medium">{count}</span>
              </button>
            );
          })}
      </div>

      {/* Search + sort controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              title={opt.title}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                sortBy === opt.key
                  ? "bg-rs-gold/15 text-rs-gold border border-rs-gold/40"
                  : "text-gray-500 border border-rs-border/40 hover:text-gray-300 hover:border-rs-border"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-500">
        {accounts.length} account{accounts.length !== 1 ? "s" : ""}
        {statusFilter && <span className="ml-1 text-rs-gold">· filtered: {statusFilter}</span>}
        {search && <span className="ml-1">· "{search}"</span>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-rs-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rs-border bg-rs-surface/50 text-left">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Account</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden sm:table-cell">Last Contact</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden md:table-cell">Latest Note</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const key = `${account._tabSlug}_${account._rowIndex}`;
              const isExpanded = expanded === key;
              const accountLogs = getLogsForAccount(mergedLogs, account);
              const outreachLogs = accountLogs.filter((entry) => entry.activity_kind !== "note");
              const latestLog = getLatestActivityLogForAccount(mergedLogs, account);
              const lastTouch = getLatestContactLogForAccount(mergedLogs, account)?.created_at || account.contactDate;
              const { label: contactLabel, daysAgo } = formatContactDate(lastTouch);

              return (
                <Fragment key={key}>
                  {/* Main row */}
                  <tr
                    className={`border-b border-rs-border/40 cursor-pointer transition-colors ${
                      isExpanded ? "bg-rs-surface-2/50" : "hover:bg-rs-surface/50"
                    }`}
                    onClick={() => setExpanded(isExpanded ? null : key)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <svg
                          className={`w-3 h-3 text-gray-600 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                          fill="currentColor" viewBox="0 0 20 20"
                        >
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                        <div>
                          <div className="font-medium text-white leading-snug">{account.account}</div>
                          {account.type && (
                            <div className="text-[11px] text-gray-500 mt-0.5">{account.type}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <select
                        value={account.status}
                        onChange={(e) => handleStatusChange(account, e.target.value)}
                        className="appearance-none bg-rs-bg text-[11px] border border-rs-border/50 rounded-md px-2 py-1.5 text-gray-300 focus:border-rs-gold focus:outline-none cursor-pointer hover:border-rs-border transition-colors font-medium"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2399a3a6' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 4px center',
                          paddingRight: '20px',
                        }}
                      >
                        {STATUS_VALUES.map(s => (
                          <option key={s} value={s} className="bg-rs-bg">{s || "(none)"}</option>
                        ))}
                      </select>
                    </td>

                    <td className={`px-4 py-3 hidden sm:table-cell ${getContactAgeClass(lastTouch)}`}>
                      <span className={
                        daysAgo !== null && daysAgo > 14 ? "font-medium" :
                        daysAgo === 0 ? "text-rs-gold" :
                        "text-gray-300"
                      }>
                        {contactLabel}
                      </span>
                    </td>

                    <td className="px-4 py-3 hidden md:table-cell" onClick={e => e.stopPropagation()}>
                      {latestLog?.note ? (
                        <div className="text-gray-400 text-xs leading-relaxed line-clamp-2">
                          {latestLog.note}
                        </div>
                      ) : account.nextSteps ? (
                        <div className="text-gray-400 text-xs leading-relaxed line-clamp-2">
                          {account.nextSteps}
                        </div>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isExpanded && (
                    <tr className="border-b border-rs-border/40 bg-rs-bg/60">
                      <td colSpan={5} className="px-4 pt-0 pb-4">
                        <ExpandedRow
                          account={account}
                          outreachLogs={outreachLogs}
                          onLogOutreach={() => setModalAccount(account)}
                          editingCell={editingCell}
                          editValue={editValue}
                          onEditStart={(field, value) => {
                            setEditingCell({ key: `${account._tabSlug}_${account._rowIndex}`, field });
                            setEditValue(value);
                          }}
                          onEditChange={(value) => setEditValue(value)}
                          onEditSave={(field, value) => handleFieldEdit(account, field, value)}
                          onEditCancel={() => {
                            setEditingCell(null);
                            setEditValue("");
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {accounts.length === 0 && (
          <div className="py-16 text-center text-gray-600">
            No accounts match your current filters.
          </div>
        )}
      </div>

      {modalAccount && (
        <LogOutreachModal
          account={modalAccount}
          onClose={() => setModalAccount(null)}
          onSubmit={handleSubmitOutreach}
        />
      )}
    </div>
  );
}

function ExpandedRow({
  account,
  outreachLogs,
  onLogOutreach,
  editingCell,
  editValue,
  onEditStart,
  onEditSave,
  onEditChange,
  onEditCancel,
}: {
  account: AnyAccount;
  outreachLogs: ActivityLog[];
  onLogOutreach: () => void;
  editingCell: { key: string; field: string } | null;
  editValue: string;
  onEditStart: (field: string, value: string) => void;
  onEditSave: (field: string, value: string) => void;
  onEditChange: (value: string) => void;
  onEditCancel: () => void;
}) {
  const hasLocation = "location" in account && account.location;
  const hasIg = "ig" in account && account.ig;
  const hasWebsite = "website" in account && account.website;
  const hasEstMonthly = "estMonthlyOrder" in account && account.estMonthlyOrder;
  const hasKitchen = "kitchen" in account && account.kitchen;

  return (
    <div className="mt-3 grid grid-cols-1 lg:grid-cols-5 gap-5 text-xs">

      {/* Left panel: account info (2 of 5 cols) */}
      <div className="lg:col-span-2 space-y-3">
        <div className="text-[10px] uppercase tracking-[0.3em] text-gray-600 font-semibold">Account Info</div>

        <div className="space-y-1.5">
          {account.contactName || editingCell?.field === "CONTACT_NAME" ? (
            <div className="flex gap-2">
              <span className="text-gray-600 w-20 shrink-0">Contact</span>
              {editingCell?.field === "CONTACT_NAME" ? (
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => onEditChange(e.target.value)}
                  onBlur={() => onEditSave("CONTACT_NAME", editValue)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onEditSave("CONTACT_NAME", editValue);
                    if (e.key === "Escape") onEditCancel();
                  }}
                  className="bg-rs-surface border border-rs-gold/50 rounded px-1.5 py-0.5 text-gray-200 focus:border-rs-gold focus:outline-none flex-1 text-xs"
                  autoFocus
                />
              ) : (
                <span
                  onClick={() => onEditStart("CONTACT_NAME", account.contactName || "")}
                  className="text-gray-200 cursor-pointer hover:text-rs-gold transition-colors"
                >
                  {account.contactName || "—"}
                </span>
              )}
            </div>
          ) : null}
          {account.email || editingCell?.field === "EMAIL" ? (
            <div className="flex gap-2">
              <span className="text-gray-600 w-20 shrink-0">Email</span>
              {editingCell?.field === "EMAIL" ? (
                <input
                  type="email"
                  value={editValue}
                  onChange={(e) => onEditChange(e.target.value)}
                  onBlur={() => onEditSave("EMAIL", editValue)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onEditSave("EMAIL", editValue);
                    if (e.key === "Escape") onEditCancel();
                  }}
                  className="bg-rs-surface border border-rs-gold/50 rounded px-1.5 py-0.5 text-gray-200 focus:border-rs-gold focus:outline-none flex-1 text-xs"
                  autoFocus
                />
              ) : (
                <a
                  href={`mailto:${account.email}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onEditStart("EMAIL", account.email || "");
                  }}
                  className="text-rs-gold hover:underline truncate cursor-pointer"
                  title="Click to edit"
                >
                  {account.email || "—"}
                </a>
              )}
            </div>
          ) : null}
          {account.phone || editingCell?.field === "PHONE" ? (
            <div className="flex gap-2">
              <span className="text-gray-600 w-20 shrink-0">Phone</span>
              {editingCell?.field === "PHONE" ? (
                <input
                  type="tel"
                  value={editValue}
                  onChange={(e) => onEditChange(e.target.value)}
                  onBlur={() => onEditSave("PHONE", editValue)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onEditSave("PHONE", editValue);
                    if (e.key === "Escape") onEditCancel();
                  }}
                  className="bg-rs-surface border border-rs-gold/50 rounded px-1.5 py-0.5 text-gray-200 focus:border-rs-gold focus:outline-none flex-1 text-xs"
                  autoFocus
                />
              ) : (
                <a
                  href={`tel:${account.phone}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onEditStart("PHONE", account.phone || "");
                  }}
                  className="text-gray-300 hover:text-rs-gold cursor-pointer transition-colors"
                  title="Click to edit"
                >
                  {account.phone ? formatPhone(account.phone) : "—"}
                </a>
              )}
            </div>
          ) : null}
          {hasLocation && (
            <div className="flex gap-2">
              <span className="text-gray-600 w-20 shrink-0">Location</span>
              <span className="text-gray-300">{account.location as string}</span>
            </div>
          )}
          {hasIg && (
            <div className="flex gap-2">
              <span className="text-gray-600 w-20 shrink-0">Instagram</span>
              <span className="text-gray-300">{account.ig as string}</span>
            </div>
          )}
          {hasWebsite && (
            <div className="flex gap-2">
              <span className="text-gray-600 w-20 shrink-0">Website</span>
              <a
                href={(account.website as string).startsWith("http") ? account.website as string : `https://${account.website}`}
                target="_blank" rel="noopener noreferrer"
                className="text-rs-gold hover:underline truncate"
              >
                {account.website as string}
              </a>
            </div>
          )}
          {hasEstMonthly && (
            <div className="flex gap-2">
              <span className="text-gray-600 w-20 shrink-0">Est. Monthly</span>
              <span className="text-rs-gold font-semibold">{account.estMonthlyOrder as string}</span>
            </div>
          )}
          {hasKitchen && (
            <div className="flex gap-2">
              <span className="text-gray-600 w-20 shrink-0">Kitchen</span>
              <span className="text-gray-300">{account.kitchen as string}</span>
            </div>
          )}
        </div>

        {/* Next steps from sheet */}
        {account.nextSteps && (
          <div className="rounded-lg border border-rs-sunset/30 bg-rs-sunset/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-rs-sunset/70 mb-1.5 font-semibold">
              Next Steps (sheet)
            </div>
            <div className="text-gray-200 leading-relaxed">{account.nextSteps}</div>
          </div>
        )}

        {account.notes && (
          <div className="rounded-lg border border-rs-border/40 bg-rs-surface/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5 font-semibold">Notes</div>
            <div className="text-gray-400 leading-relaxed">{account.notes}</div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onLogOutreach}
            className="px-3 py-1.5 rounded-lg bg-rs-gold/15 text-rs-gold text-xs font-medium hover:bg-rs-gold/25 border border-rs-gold/40 transition-colors"
          >
            + Log Outreach
          </button>
          <Link
            href={`/accounts/${account._tabSlug}/${account._rowIndex}`}
            className="px-3 py-1.5 rounded-lg border border-rs-border/50 text-gray-400 text-xs hover:text-gray-200 hover:border-rs-border transition-colors"
            onClick={e => e.stopPropagation()}
          >
            Full Detail →
          </Link>
        </div>
      </div>

      {/* Right panel: outreach history (3 of 5 cols) */}
      <div className="lg:col-span-3 space-y-3">
        <div className="text-[10px] uppercase tracking-[0.3em] text-gray-600 font-semibold">
          Outreach History {outreachLogs.length > 0 && <span className="text-gray-500">({outreachLogs.length})</span>}
        </div>

        {outreachLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-rs-border/40 py-6 text-center text-gray-600">
            No logged activity yet — click "+ Log Outreach" to start the record.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {outreachLogs.map(log => {
              const parsed = parseActivityNote(log.note);
              return (
                <div key={log.id} className="rounded-lg border border-rs-border/40 bg-rs-surface/40 p-3 space-y-2">
                  {/* Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-rs-surface-2 text-rs-gold text-[10px] uppercase tracking-wider font-semibold">
                        {log.action_type}
                      </span>
                      {log.status_after && log.status_after !== log.status_before && (
                        <span className="text-[10px] text-gray-500">
                          {log.status_before || "—"} → <span className="text-gray-300">{log.status_after}</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-600 shrink-0">
                      {new Date(log.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                    </span>
                  </div>

                  {/* Structured content */}
                  {parsed.summary && (
                    <div className="text-gray-100 font-medium leading-snug">{parsed.summary}</div>
                  )}
                  {parsed.details && (
                    <div className="text-gray-400 leading-relaxed">{parsed.details}</div>
                  )}
                  {parsed.objection && (
                    <div className="flex gap-1.5 text-orange-300/90 bg-orange-400/5 border border-orange-400/20 rounded px-2 py-1.5">
                      <span className="font-semibold shrink-0">Objection:</span>
                      <span>{parsed.objection}</span>
                    </div>
                  )}
                  {parsed.nextStep && (
                    <div className="flex gap-1.5 text-rs-gold/80 bg-rs-gold/5 border border-rs-gold/20 rounded px-2 py-1.5">
                      <span className="font-semibold shrink-0">Next:</span>
                      <span>{parsed.nextStep}</span>
                    </div>
                  )}
                  {log.follow_up_date && (
                    <div className="text-[10px] text-[#bcaef0]">
                      Follow-up: {new Date(log.follow_up_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
