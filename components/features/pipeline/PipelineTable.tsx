"use client";

import { useState, useMemo, Fragment } from "react";
import { AnyAccount, AllTabsData, TabName } from "@/types/accounts";
import { Tabs } from "@/components/ui/Tabs";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { STATUS_VALUES, TAB_NAMES } from "@/lib/utils/constants";
import { formatPhone } from "@/lib/utils/phone";
import { useSheetStore } from "@/stores/useSheetStore";
import { useOutreachStore, OutreachEntry } from "@/stores/useOutreachStore";
import { LogOutreachModal } from "@/components/features/dashboard/LogOutreachModal";
import { todayISO, daysSince, dateToTimestamp, parseAppDate, getContactAgeClass } from "@/lib/utils/dates";
import { parseActivityNote } from "@/lib/activity/notes";
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
  const { fetchAllTabs } = useSheetStore();
  const outreachStore = useOutreachStore();

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
      if (sortBy === "name") return a.account.localeCompare(b.account);

      if (sortBy === "stale") {
        const aT = dateToTimestamp(a.contactDate);
        const bT = dateToTimestamp(b.contactDate);
        return aT - bT; // oldest first = most stale
      }

      if (sortBy === "recent") {
        const aT = dateToTimestamp(a.contactDate);
        const bT = dateToTimestamp(b.contactDate);
        return bT - aT;
      }

      // Default "status": active stages first, then stale-first within same stage
      const aOrder = STATUS_SORT_ORDER[a.status] ?? 5;
      const bOrder = STATUS_SORT_ORDER[b.status] ?? 5;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const aT = dateToTimestamp(a.contactDate);
      const bT = dateToTimestamp(b.contactDate);
      return aT - bT;
    });
  }, [allForTab, search, statusFilter, sortBy]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of allForTab) {
      const s = a.status || "(none)";
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [allForTab]);

  const handleStatusChange = async (account: AnyAccount, newStatus: string) => {
    await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab: account._tab, rowIndex: account._rowIndex, newStatus }),
    });
    await fetchAllTabs();
  };

  const handleSubmitOutreach = async (outreachData: {
    actionType: string; statusAfter: string; note: string; followUpDate: string;
  }) => {
    if (!modalAccount) return;
    const accountId = `${modalAccount._tabSlug}_${modalAccount._rowIndex}`;

    outreachStore.addEntry({
      account_id: accountId,
      account_name: modalAccount.account,
      tab: modalAccount._tabSlug,
      action_type: outreachData.actionType,
      note: outreachData.note,
      status_before: modalAccount.status,
      status_after: outreachData.statusAfter,
      follow_up_date: outreachData.followUpDate || null,
      source: "manual",
      activity_kind: "outreach",
      counts_as_contact: true,
    });

    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId,
        tab: modalAccount._tabSlug,
        row_index: modalAccount._rowIndex,
        account_name: modalAccount.account,
        action_type: outreachData.actionType,
        note: outreachData.note,
        status_before: modalAccount.status,
        status_after: outreachData.statusAfter,
        follow_up_date: outreachData.followUpDate || null,
        source: "manual",
        activity_kind: "outreach",
        counts_as_contact: true,
      }),
    }).catch(() => {});

    await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab: modalAccount._tab,
        rowIndex: modalAccount._rowIndex,
        newStatus: outreachData.statusAfter,
        contactDate: todayISO(),
        nextSteps: outreachData.note,
      }),
    });

    if (outreachData.followUpDate) {
      fetch("/api/notion/tasks", {
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
              const outreachLogs = outreachStore.getEntriesForAccount(key);
              const { label: contactLabel, daysAgo } = formatContactDate(account.contactDate);

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

                    <td className={`px-4 py-3 hidden sm:table-cell ${getContactAgeClass(account.contactDate)}`}>
                      <span className={
                        daysAgo !== null && daysAgo > 14 ? "font-medium" :
                        daysAgo === 0 ? "text-rs-gold" :
                        "text-gray-300"
                      }>
                        {contactLabel}
                      </span>
                    </td>

                    <td className="px-4 py-3 hidden md:table-cell" onClick={e => e.stopPropagation()}>
                      {outreachLogs.length > 0 ? (
                        <div className="text-gray-400 text-xs leading-relaxed line-clamp-2">
                          {outreachLogs[outreachLogs.length - 1].note}
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
}: {
  account: AnyAccount;
  outreachLogs: OutreachEntry[];
  onLogOutreach: () => void;
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
          {account.contactName && (
            <div className="flex gap-2">
              <span className="text-gray-600 w-20 shrink-0">Contact</span>
              <span className="text-gray-200">{account.contactName}</span>
            </div>
          )}
          {account.email && (
            <div className="flex gap-2">
              <span className="text-gray-600 w-20 shrink-0">Email</span>
              <a href={`mailto:${account.email}`} className="text-rs-gold hover:underline truncate">{account.email}</a>
            </div>
          )}
          {account.phone && (
            <div className="flex gap-2">
              <span className="text-gray-600 w-20 shrink-0">Phone</span>
              <a href={`tel:${account.phone}`} className="text-gray-300 hover:text-rs-gold">{formatPhone(account.phone)}</a>
            </div>
          )}
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
