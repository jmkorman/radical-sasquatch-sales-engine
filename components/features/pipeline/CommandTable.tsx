"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { AllTabsData, AnyAccount } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { PipelineTweaks } from "@/types/pipeline";
import { LogOutreachModal } from "@/components/features/dashboard/LogOutreachModal";
import { useSheetStore } from "@/stores/useSheetStore";
import { useUIStore } from "@/stores/useUIStore";
import { parseActivityNote } from "@/lib/activity/notes";
import { getLogsForAccount } from "@/lib/activity/timeline";
import { persistActivityEntry } from "@/lib/activity/persist";
import { todayISO } from "@/lib/utils/dates";
import {
  PIPELINE_STATUSES,
  STATUS_PALETTE,
  STATUS_ORDER,
  urgencyScore,
  formatContactPipeline,
  tempLabelPipeline,
  daysSincePipeline,
  getForPipelineTab,
  getAllPipelineAccounts,
  PipelineTabName,
} from "@/lib/pipeline/urgency";
import { getAccountStableId, getLogStableId } from "@/lib/accounts/identity";
import { StatusPill, StatusDot } from "./StatusIndicators";
import { STATUS_VALUES } from "@/lib/utils/constants";

type SortBy = "urgency" | "stale" | "name" | "recent";

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "urgency", label: "Urgency" },
  { key: "stale",   label: "Most Stale" },
  { key: "name",    label: "A→Z" },
  { key: "recent",  label: "Recent" },
];

const PIPELINE_TABS: PipelineTabName[] = ["All", "Restaurants", "Retail", "Catering", "Food Truck"];

export function CommandTable({
  data,
  tweaks,
}: {
  data: AllTabsData;
  tweaks: PipelineTweaks;
}) {
  const [activeTab, setActiveTab] = useState<PipelineTabName>("Restaurants");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("urgency");
  const [selected, setSelected] = useState<AnyAccount | null>(null);
  const [modalAccount, setModalAccount] = useState<AnyAccount | null>(null);
  const [serverLogs, setServerLogs] = useState<ActivityLog[]>([]);

  const { fetchAllTabs } = useSheetStore();
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);

  useEffect(() => {
    fetch("/api/activity", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : [])
      .then(setServerLogs)
      .catch(() => setServerLogs([]));
  }, []);

  const tabCounts = useMemo(() => ({
    All: getAllPipelineAccounts(data).length,
    Restaurants: data.restaurants.length,
    Retail: data.retail.length,
    Catering: data.catering.length,
    "Food Truck": data.foodTruck.length,
  }), [data]);

  const all = useMemo(() => getForPipelineTab(data, activeTab), [data, activeTab]);

  // Build a search index: stableAccountId → combined note text from all logs
  const notesByAccountId = useMemo(() => {
    const map = new Map<string, string>();
    serverLogs.forEach((log) => {
      if (!log.note) return;
      const key = getLogStableId(log);
      map.set(key, (map.get(key) ?? "") + " " + log.note);
    });
    return map;
  }, [serverLogs]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    all.forEach((a) => { const s = a.status || ""; c[s] = (c[s] || 0) + 1; });
    return c;
  }, [all]);

  const rows = useMemo(() => {
    let list = all;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a) => {
        if (a.account.toLowerCase().includes(q)) return true;
        if ((a.contactName || "").toLowerCase().includes(q)) return true;
        if ("location" in a && ((a.location as string) || "").toLowerCase().includes(q)) return true;
        // Search sheet notes field
        if ((a.notes || "").toLowerCase().includes(q)) return true;
        // Search activity log notes
        const logNotes = notesByAccountId.get(getAccountStableId(a)) ?? "";
        if (logNotes.toLowerCase().includes(q)) return true;
        return false;
      });
    }
    if (statusFilter) list = list.filter((a) => a.status === statusFilter);
    return [...list].sort((a, b) => {
      if (sortBy === "name") return a.account.localeCompare(b.account);
      if (sortBy === "stale")
        return (daysSincePipeline(b.contactDate) ?? 999) - (daysSincePipeline(a.contactDate) ?? 999);
      if (sortBy === "recent")
        return (daysSincePipeline(a.contactDate) ?? 999) - (daysSincePipeline(b.contactDate) ?? 999);
      return urgencyScore(b) - urgencyScore(a); // urgency default
    });
  }, [all, search, statusFilter, sortBy, notesByAccountId]);

  const rowPad =
    tweaks.density === "compact" ? "8px 14px" : tweaks.density === "roomy" ? "18px 16px" : "12px 16px";

  const handleStatusChange = async (account: AnyAccount, newStatus: string) => {
    const previousStatus = account.status;
    const response = await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab: account._tab,
        rowIndex: account._rowIndex,
        newStatus,
      }),
    });
    if (!response.ok) {
      showActionFeedback("Couldn't update the pipeline status.", "error");
      // Revert optimistic update if any
      void previousStatus;
      return;
    }
    await fetchAllTabs();
    showActionFeedback("Status updated.", "success");
  };

  const handleSubmitOutreach = async (outreachData: {
    actionType: string;
    statusAfter: string;
    note: string;
    followUpDate: string;
  }) => {
    if (!modalAccount) return;
    let log: ActivityLog;
    try {
      log = await persistActivityEntry({
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
    } catch {
      showActionFeedback("Couldn't save outreach entry.", "error");
      return;
    }

    setServerLogs((existing) => [log, ...existing]);

    const response = await fetch("/api/sheets/update", {
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

    if (!response.ok) {
      showActionFeedback("Outreach logged, but pipeline row failed to update.", "error");
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
    showActionFeedback("Outreach logged.", "success");
  };

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: selected ? "1fr minmax(280px, 420px)" : "1fr",
      gap: 16,
      minWidth: 0,
    }}>
      <div>
        {/* Sub-tabs */}
        <PipelineSubTabs value={activeTab} setValue={(t) => { setActiveTab(t); setSelected(null); setStatusFilter(""); }} counts={tabCounts} />

        {/* Filter rail */}
        <div style={{ display: "flex", gap: 14, alignItems: "center", margin: "14px 0", flexWrap: "wrap" }}>
          <SearchInput value={search} onChange={setSearch} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <FilterChip
              active={statusFilter === ""}
              onClick={() => setStatusFilter("")}
              label="All"
              count={all.length}
              neutral
            />
            {PIPELINE_STATUSES.filter((s) => statusCounts[s]).map((s) => (
              <FilterChip
                key={s}
                active={statusFilter === s}
                onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
                status={s}
                count={statusCounts[s]}
              />
            ))}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.3em",
                color: "#8c7fbd",
                textTransform: "uppercase",
                marginRight: 6,
              }}
            >
              Sort
            </span>
            {SORT_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                style={{
                  padding: "6px 11px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 8,
                  border:
                    sortBy === key
                      ? "1px solid rgba(100,245,234,0.5)"
                      : "1px solid rgba(73,48,140,0.5)",
                  background: sortBy === key ? "rgba(100,245,234,0.12)" : "transparent",
                  color: sortBy === key ? "#64f5ea" : "#bcaef0",
                  cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary bar */}
        <div
          style={{
            display: "flex",
            gap: 0,
            border: "1px solid rgba(73,48,140,0.6)",
            borderRadius: 14,
            marginBottom: 14,
            overflow: "hidden",
            background: "rgba(16,7,38,0.5)",
          }}
        >
          {PIPELINE_STATUSES.map((s, i) => {
            const n = statusCounts[s] || 0;
            const total = all.length || 1;
            const pct = (n / total) * 100;
            const c = STATUS_PALETTE[s];
            return (
              <div
                key={s}
                style={{
                  flex: `${Math.max(pct, 12)} 1 0`,
                  padding: "12px 16px",
                  borderRight:
                    i < PIPELINE_STATUSES.length - 1 ? "1px solid rgba(73,48,140,0.5)" : "none",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: `linear-gradient(180deg, ${c.base}22 0%, transparent 100%)`,
                    pointerEvents: "none",
                  }}
                />
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusDot status={s} size={8} glow />
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: 0.5,
                        color: c.ink,
                        textTransform: "uppercase",
                        fontWeight: 600,
                        opacity: 0.85,
                      }}
                    >
                      {s}
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: "#fff4e8",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      {n}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "6px minmax(200px, 1.5fr) minmax(120px, 160px) minmax(100px, 130px) minmax(250px, 1.8fr)",
            gap: 0,
            padding: "8px 16px 8px 22px",
            fontSize: 10,
            letterSpacing: "0.32em",
            color: "#8c7fbd",
            textTransform: "uppercase",
            fontWeight: 700,
            background: "rgba(16,7,38,0.4)",
            border: "1px solid rgba(73,48,140,0.5)",
            borderBottom: "none",
            borderRadius: "12px 12px 0 0",
          }}
        >
          <span />
          <span>Account</span>
          <span>Stage</span>
          <span>Last Touch</span>
          <span>Latest Note</span>
        </div>

        {/* Rows */}
        <div
          style={{
            border: "1px solid rgba(73,48,140,0.5)",
            borderTop: "none",
            borderRadius: "0 0 14px 14px",
            overflow: "auto",
            overflowY: "auto",
            overflowX: "auto",
            background: "rgba(16,7,38,0.35)",
            maxHeight: "70vh",
          }}
        >
          {rows.map((account, i) => {
            const isSel =
              selected !== null &&
              selected.account === account.account &&
              selected._tab === account._tab &&
              selected._rowIndex === account._rowIndex;
            return (
              <TableRow
                key={`${account._tab}_${account._rowIndex}`}
                account={account}
                selected={isSel}
                onSelect={() => setSelected(isSel ? null : account)}
                tweaks={tweaks}
                rowPad={rowPad}
                lastOfList={i === rows.length - 1}
                serverLogs={serverLogs}
              />
            );
          })}
          {rows.length === 0 && (
            <div style={{ padding: "48px 20px", textAlign: "center", color: "#8c7fbd" }}>
              No accounts match your filters.
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      {selected && (
        <SidePanel
          account={selected}
          serverLogs={serverLogs}
          onClose={() => setSelected(null)}
          onLogOutreach={() => setModalAccount(selected)}
          onStatusChange={handleStatusChange}
        />
      )}

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

/* ─── Sub-components ─────────────────────────────────────────── */

function PipelineSubTabs({
  value,
  setValue,
  counts,
}: {
  value: PipelineTabName;
  setValue: (t: PipelineTabName) => void;
  counts: Record<string, number>;
}) {
  return (
    <div style={{ display: "flex", gap: 2, borderBottom: "1px solid rgba(73,48,140,0.6)" }}>
      {PIPELINE_TABS.map((t) => {
        const active = value === t;
        return (
          <button
            key={t}
            onClick={() => setValue(t)}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: active ? "2px solid #64f5ea" : "2px solid transparent",
              color: active ? "#64f5ea" : "#bcaef0",
              fontWeight: active ? 700 : 600,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: 0.3,
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: -1,
            }}
          >
            {t}
            {counts[t] !== undefined && (
              <span
                style={{
                  fontSize: 10.5,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: active ? "rgba(100,245,234,0.15)" : "rgba(255,255,255,0.05)",
                  color: active ? "#64f5ea" : "#8c7fbd",
                  fontWeight: 700,
                }}
              >
                {counts[t]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: "relative", minWidth: 260, flex: "0 1 320px" }}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#8c7fbd"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        placeholder="Search account, contact, location…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "9px 14px 9px 34px",
          borderRadius: 10,
          border: "1px solid rgba(73,48,140,0.6)",
          background: "rgba(16,7,38,0.55)",
          color: "#fff4e8",
          fontSize: 13,
          fontFamily: "'Space Grotesk', sans-serif",
          outline: "none",
        }}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  status,
  count,
  label,
  neutral,
}: {
  active: boolean;
  onClick: () => void;
  status?: string;
  count: number;
  label?: string;
  neutral?: boolean;
}) {
  const c = status ? STATUS_PALETTE[status] : null;
  const bg = neutral
    ? active
      ? "rgba(100,245,234,0.15)"
      : "rgba(255,255,255,0.04)"
    : active
    ? `color-mix(in oklch, ${c!.base} 22%, transparent)`
    : "rgba(255,255,255,0.03)";
  const border = neutral
    ? active
      ? "rgba(100,245,234,0.5)"
      : "rgba(73,48,140,0.5)"
    : active
    ? `color-mix(in oklch, ${c!.base} 55%, transparent)`
    : "rgba(73,48,140,0.4)";
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: bg,
        color: active ? (c ? c.ink : "#64f5ea") : "#bcaef0",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "'Space Grotesk', sans-serif",
        textTransform: "uppercase",
        letterSpacing: 0.3,
      }}
    >
      {status && <StatusDot status={status} size={6} glow />}
      {label ?? status}
      <span style={{ opacity: 0.7, fontWeight: 700 }}>{count}</span>
    </button>
  );
}

function TableRow({
  account,
  selected,
  onSelect,
  tweaks,
  rowPad,
  lastOfList,
  serverLogs,
}: {
  account: AnyAccount;
  selected: boolean;
  onSelect: () => void;
  tweaks: PipelineTweaks;
  rowPad: string;
  lastOfList: boolean;
  serverLogs: ActivityLog[];
}) {
  const touch = formatContactPipeline(account.contactDate);
  const c = STATUS_PALETTE[account.status] ?? STATUS_PALETTE[""];
  const urgencyEnabled = tweaks.urgency !== "off";
  const loud = tweaks.urgency === "loud";

  // Latest note: from activity log or sheet
  const accountLogs = getLogsForAccount(serverLogs, account);
  const latestNote = accountLogs[0]?.note || account.nextSteps || "";

  return (
    <div
      onClick={onSelect}
      style={{
        display: "grid",
        gridTemplateColumns: "6px minmax(260px, 1.8fr) 160px 130px minmax(350px, 2fr)",
        gap: 0,
        alignItems: "center",
        background: selected
          ? "linear-gradient(90deg, rgba(100,245,234,0.08), rgba(100,245,234,0.02))"
          : "transparent",
        borderBottom: lastOfList ? "none" : "1px solid rgba(73,48,140,0.3)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        if (!selected)
          (e.currentTarget as HTMLDivElement).style.background = "rgba(73,48,140,0.15)";
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      {/* Status stripe */}
      <div
        style={{
          alignSelf: "stretch",
          background: c.base,
          boxShadow: tweaks.neon ? `inset 2px 0 8px ${c.glow}` : "none",
        }}
      />

      {/* Account */}
      <div style={{ padding: rowPad, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#fff4e8",
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: 0.1,
          }}
        >
          {account.account}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#8c7fbd",
            marginTop: 2,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span>{account.type || "—"}</span>
          {"location" in account && account.location && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{account.location as string}</span>
            </>
          )}
        </div>
      </div>

      {/* Stage */}
      <div style={{ padding: rowPad }}>
        <StatusPill status={account.status} />
      </div>

      {/* Last touch */}
      <div style={{ padding: rowPad }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: (() => {
              const d = touch.days;
              if (d === null) return "#8c7fbd";
              if (d <= 2)  return "#4ade80";
              if (d <= 7)  return "#86efac";
              if (d <= 14) return "#fbbf24";
              return "#ff7c70";
            })(),
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {touch.label}
        </div>
        {urgencyEnabled && (
          <div style={{ marginTop: 4 }}>
            <TempBar days={touch.days} loud={loud} />
          </div>
        )}
      </div>

      {/* Note */}
      <div
        style={{
          padding: rowPad,
          fontSize: 12,
          color: "#bcaef0",
          lineHeight: 1.45,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {latestNote || <span style={{ color: "#5a4a8a" }}>—</span>}
      </div>
    </div>
  );
}

function TempBar({ days, loud }: { days: number | null; loud: boolean }) {
  // Color bracket based on age
  const color =
    days === null ? "#8c7fbd"
    : days <= 2   ? "#4ade80"
    : days <= 7   ? "#86efac"
    : days <= 14  ? "#fbbf24"
    : "#ff7c70";
  // Bar starts full when fresh, depletes as days increase (21d = empty)
  const filled = days === null ? 0 : Math.max(0, Math.min(10, Math.round(10 - (days / 21) * 10)));
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {[...Array(10)].map((_, i) => (
        <span
          key={i}
          style={{
            width: loud ? 6 : 4,
            height: loud ? 6 : 4,
            borderRadius: 1,
            background: i < filled ? color : "rgba(73,48,140,0.4)",
            boxShadow: loud && i < filled ? `0 0 4px ${color}` : "none",
          }}
        />
      ))}
    </div>
  );
}

function SidePanel({
  account,
  serverLogs,
  onClose,
  onLogOutreach,
  onStatusChange,
}: {
  account: AnyAccount;
  serverLogs: ActivityLog[];
  onClose: () => void;
  onLogOutreach: () => void;
  onStatusChange: (account: AnyAccount, newStatus: string) => void;
}) {
  const touch = formatContactPipeline(account.contactDate);
  const temp = tempLabelPipeline(touch.days);
  const c = STATUS_PALETTE[account.status] ?? STATUS_PALETTE[""];
  const accountLogs = getLogsForAccount(serverLogs, account).filter(
    (l) => l.activity_kind !== "note"
  );

  const tempColor =
    temp.tone === "hot"
      ? "#64f5ea"
      : temp.tone === "warm"
      ? "#ffb321"
      : temp.tone === "cool"
      ? "#ffd700"
      : temp.tone === "grey"
      ? "#8c7fbd"
      : "#ff7c70";
  const tempBg =
    temp.tone === "hot"
      ? "rgba(100,245,234,0.14)"
      : temp.tone === "warm"
      ? "rgba(255,179,33,0.14)"
      : temp.tone === "cool"
      ? "rgba(255,215,0,0.14)"
      : temp.tone === "grey"
      ? "rgba(140,127,189,0.14)"
      : "rgba(255,124,112,0.14)";
  const tempBorder =
    temp.tone === "hot"
      ? "rgba(100,245,234,0.35)"
      : temp.tone === "warm"
      ? "rgba(255,179,33,0.35)"
      : temp.tone === "cool"
      ? "rgba(255,215,0,0.35)"
      : temp.tone === "grey"
      ? "rgba(140,127,189,0.35)"
      : "rgba(255,124,112,0.35)";

  return (
    <div
      style={{
        position: "sticky",
        top: 96,
        alignSelf: "start",
        height: "calc(100vh - 112px)",
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
        border: "1px solid rgba(73,48,140,0.6)",
        background: "linear-gradient(180deg, rgba(26,15,69,0.85), rgba(16,7,38,0.88))",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "18px 20px",
          borderBottom: "1px solid rgba(73,48,140,0.5)",
          background: `linear-gradient(135deg, ${c.base}1f 0%, transparent 70%)`,
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "rgba(16,7,38,0.6)",
            border: "1px solid rgba(73,48,140,0.6)",
            color: "#bcaef0",
            fontSize: 13,
            cursor: "pointer",
            width: 26,
            height: 26,
            borderRadius: 8,
          }}
        >
          ×
        </button>
        <div
          style={{
            fontSize: 9.5,
            letterSpacing: "0.32em",
            color: "#bcaef0",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {account._tab}
          {"location" in account && account.location ? ` · ${account.location as string}` : ""}
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#fff4e8",
            fontFamily: "'Space Grotesk', sans-serif",
            marginTop: 4,
            marginRight: 30,
            lineHeight: 1.15,
          }}
        >
          {account.account}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <StatusPill status={account.status} />
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              background: tempBg,
              color: tempColor,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              fontFamily: "'Space Grotesk', sans-serif",
              border: `1px solid ${tempBorder}`,
            }}
          >
            {temp.label}
          </span>
        </div>
      </div>

      <div style={{ overflowY: "auto", flex: 1, padding: 20 }}>
        {/* Actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
          <button
            onClick={onLogOutreach}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(100,245,234,0.5)",
              background: "linear-gradient(180deg, rgba(100,245,234,0.22), rgba(100,245,234,0.08))",
              color: "#64f5ea",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            + Log Outreach
          </button>
          <Link
            href={`/accounts/${account._tabSlug}/${account._rowIndex}`}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(73,48,140,0.6)",
              background: "rgba(255,255,255,0.03)",
              color: "#bcaef0",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Full Detail →
          </Link>
        </div>

        {/* Status change */}
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.34em",
              color: "#8c7fbd",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Status
          </div>
          <select
            value={account.status}
            onChange={(e) => onStatusChange(account, e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${c.base}55`,
              background: `${c.base}18`,
              color: c.ink,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Space Grotesk', sans-serif",
              cursor: "pointer",
              appearance: "none",
            }}
          >
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s} style={{ background: "#100726", color: "#fff4e8" }}>
                {s || "(none)"}
              </option>
            ))}
          </select>
        </div>

        {/* Account facts */}
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.34em",
            color: "#8c7fbd",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          Account
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "80px 1fr",
            rowGap: 6,
            columnGap: 10,
            fontSize: 12,
            marginBottom: 18,
          }}
        >
          {[
            ["Contact", account.contactName || "—"],
            ["Email", account.email || "—"],
            ["Phone", account.phone || "—"],
            ["Commission", "commissionPct" in account ? (account.commissionPct as string) || "—" : "—"],
          ]
            .filter(([, v]) => v !== "—")
            .map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <div
                  style={{
                    color: "#8c7fbd",
                    textTransform: "uppercase",
                    fontSize: 10,
                    letterSpacing: 0.5,
                    paddingTop: 2,
                  }}
                >
                  {k}
                </div>
                <div
                  style={{
                    color: "#fff4e8",
                    fontWeight: 500,
                    wordBreak: "break-word",
                  }}
                >
                  {v}
                </div>
              </div>
            ))}
        </div>

        {/* Next steps */}
        {account.nextSteps && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid rgba(255,179,33,0.3)",
              background: "rgba(255,179,33,0.06)",
              marginBottom: 18,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.3em",
                color: "#ffb321",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              Next Steps
            </div>
            <div style={{ color: "#fff4e8", fontSize: 13, lineHeight: 1.5 }}>
              {account.nextSteps}
            </div>
          </div>
        )}

        {/* Outreach history */}
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.34em",
            color: "#8c7fbd",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          Outreach history{" "}
          {accountLogs.length > 0 && (
            <span style={{ color: "#8c7fbd" }}>({accountLogs.length})</span>
          )}
        </div>

        {accountLogs.length === 0 ? (
          <div
            style={{
              padding: 16,
              border: "1px dashed rgba(73,48,140,0.5)",
              borderRadius: 10,
              textAlign: "center",
              color: "#8c7fbd",
              fontSize: 12,
            }}
          >
            No logged activity yet.
          </div>
        ) : (
          <div style={{ position: "relative", paddingLeft: 18 }}>
            <div
              style={{
                position: "absolute",
                left: 5,
                top: 6,
                bottom: 6,
                width: 1,
                background: "rgba(73,48,140,0.5)",
              }}
            />
            {accountLogs.map((log) => {
              const parsed = parseActivityNote(log.note);
              return (
                <div key={log.id} style={{ position: "relative", marginBottom: 14 }}>
                  <div
                    style={{
                      position: "absolute",
                      left: -17,
                      top: 4,
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: "#64f5ea",
                      boxShadow: "0 0 8px rgba(100,245,234,0.6)",
                      border: "2px solid #100726",
                    }}
                  />
                  <div
                    style={{
                      fontSize: 10,
                      color: "#8c7fbd",
                      fontWeight: 600,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    {log.action_type} ·{" "}
                    {new Date(log.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                    {log.status_after && log.status_after !== log.status_before && (
                      <span style={{ color: "#64f5ea", marginLeft: 6 }}>→ {log.status_after}</span>
                    )}
                  </div>
                  {parsed.summary && (
                    <div
                      style={{
                        color: "#fff4e8",
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 3,
                      }}
                    >
                      {parsed.summary}
                    </div>
                  )}
                  {parsed.details && (
                    <div
                      style={{ color: "#bcaef0", fontSize: 12, lineHeight: 1.5, marginBottom: 5 }}
                    >
                      {parsed.details}
                    </div>
                  )}
                  {parsed.objection && (
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "#ff7c70",
                        background: "rgba(255,124,112,0.08)",
                        border: "1px solid rgba(255,124,112,0.25)",
                        padding: "6px 9px",
                        borderRadius: 6,
                        marginTop: 4,
                      }}
                    >
                      <b>Objection:</b> {parsed.objection}
                    </div>
                  )}
                  {parsed.nextStep && (
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "#64f5ea",
                        background: "rgba(100,245,234,0.06)",
                        border: "1px solid rgba(100,245,234,0.25)",
                        padding: "6px 9px",
                        borderRadius: 6,
                        marginTop: 4,
                      }}
                    >
                      <b>Next:</b> {parsed.nextStep}
                    </div>
                  )}
                  {log.follow_up_date && (
                    <div style={{ fontSize: 10, color: "#bcaef0", marginTop: 4 }}>
                      Follow-up:{" "}
                      {new Date(log.follow_up_date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
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

// Export sub-tab for reuse in StageBoard / HotList
export { PipelineSubTabs };

// Export STATUS_ORDER re-export for consistency
export { STATUS_ORDER };
