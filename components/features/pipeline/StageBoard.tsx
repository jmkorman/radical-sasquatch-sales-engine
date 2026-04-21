"use client";

import { useEffect, useState, useMemo } from "react";
import { AllTabsData, AnyAccount } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { PipelineTweaks } from "@/types/pipeline";
import {
  ACTIVE_PIPELINE_STATUSES,
  PIPELINE_STATUSES,
  STATUS_PALETTE,
  urgencyScore,
  formatContactPipeline,
  tempLabelPipeline,
  getForPipelineTab,
  getAllPipelineAccounts,
  PipelineTabName,
} from "@/lib/pipeline/urgency";
import { StatusDot } from "./StatusIndicators";
import { PipelineSubTabs } from "./CommandTable";
import { getRevenueTier } from "@/lib/utils/revenue";
import { getLatestContactLogForAccount, getLogsForAccount } from "@/lib/activity/timeline";
import Link from "next/link";

const PIPELINE_TABS: PipelineTabName[] = ["All", "Restaurants", "Retail", "Catering", "Food Truck"];

interface BoardAccount {
  account: AnyAccount;
  status: string;
  lastContactDate: string;
}

export function StageBoard({
  data,
  tweaks,
}: {
  data: AllTabsData;
  tweaks: PipelineTweaks;
}) {
  const [activeTab, setActiveTab] = useState<PipelineTabName>("All");
  const [search, setSearch] = useState("");
  const [serverLogs, setServerLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    fetch("/api/activity", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((logs: ActivityLog[]) => setServerLogs(logs))
      .catch(() => setServerLogs([]));
  }, []);

  const tabCounts = useMemo(
    () => ({
      All: getAllPipelineAccounts(data).length,
      Restaurants: data.restaurants.length,
      Retail: data.retail.length,
      Catering: data.catering.length,
      "Food Truck": data.foodTruck.length,
    }),
    [data]
  );

  const all = useMemo(() => getForPipelineTab(data, activeTab), [data, activeTab]);

  const boardAccounts = useMemo<BoardAccount[]>(() => {
    return all.map((account) => {
      const accountLogs = getLogsForAccount(serverLogs, account);
      const latestStatus = accountLogs.find((log) => log.status_after)?.status_after?.trim();
      const latestContact = getLatestContactLogForAccount(serverLogs, account);

      return {
        account,
        status: latestStatus || account.status || "Identified",
        lastContactDate: latestContact?.created_at || account.contactDate,
      };
    });
  }, [all, serverLogs]);

  const filtered = useMemo(() => {
    if (!search) return boardAccounts;
    const q = search.toLowerCase();
    return boardAccounts.filter(
      ({ account }) =>
        account.account.toLowerCase().includes(q) ||
        (account.contactName || "").toLowerCase().includes(q)
    );
  }, [boardAccounts, search]);

  const byStage = useMemo(() => {
    const m: Record<string, BoardAccount[]> = {};
    // Initialize all active stages + handle any legacy statuses that exist in data
    PIPELINE_STATUSES.forEach((s) => (m[s] = []));
    filtered.forEach((item) => {
      const s = item.status || "Identified";
      if (!m[s]) m[s] = [];
      m[s].push(item);
    });
    Object.keys(m).forEach((s) =>
      m[s].sort((a, b) => {
        const bAccount = { ...b.account, status: b.status } as AnyAccount;
        const aAccount = { ...a.account, status: a.status } as AnyAccount;
        return urgencyScore(bAccount, b.lastContactDate) - urgencyScore(aAccount, a.lastContactDate);
      })
    );
    return m;
  }, [filtered]);

  // Columns to display: active stages + any legacy stages that have accounts
  const displayStages = useMemo(() => {
    const legacy = PIPELINE_STATUSES.filter(
      (s) => !ACTIVE_PIPELINE_STATUSES.includes(s as typeof ACTIVE_PIPELINE_STATUSES[number]) &&
	             (byStage[s]?.length ?? 0) > 0
    );
    const extra = Object.keys(byStage).filter(
      (s) => !PIPELINE_STATUSES.includes(s as typeof PIPELINE_STATUSES[number]) && (byStage[s]?.length ?? 0) > 0
    );
    return [...ACTIVE_PIPELINE_STATUSES, ...legacy, ...extra];
  }, [byStage]);

  return (
    <div>
      <PipelineSubTabs value={activeTab} setValue={setActiveTab} counts={tabCounts} />

      <div style={{ display: "flex", gap: 14, alignItems: "center", margin: "14px 0" }}>
        {/* Search */}
        <div style={{ position: "relative", minWidth: 280, flex: "0 1 340px" }}>
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
            placeholder="Search accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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

        {/* Legend */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 14,
            alignItems: "center",
            fontSize: 11,
            color: "#8c7fbd",
            letterSpacing: 0.3,
            textTransform: "uppercase",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: "#64f5ea",
                boxShadow: "0 0 6px rgba(100,245,234,0.6)",
              }}
            />{" "}
            Fresh
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#ffb321" }} />{" "}
            Cooling
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: "#ff7c70",
                boxShadow: "0 0 6px rgba(255,124,112,0.5)",
              }}
            />{" "}
            Stale
          </span>
        </div>
      </div>

      {/* Kanban columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${displayStages.length}, minmax(200px, 1fr))`,
          gap: 12,
          overflowX: "auto",
        }}
      >
        {displayStages.map((s) => (
          <StageColumn
            key={s}
            status={s}
            accounts={byStage[s] || []}
            tweaks={tweaks}
          />
        ))}
      </div>
    </div>
  );
}

function StageColumn({
  status,
  accounts,
  tweaks,
}: {
  status: string;
  accounts: BoardAccount[];
  tweaks: PipelineTweaks;
}) {
  const c = STATUS_PALETTE[status] ?? STATUS_PALETTE[""];

  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid color-mix(in oklch, ${c.base} 30%, rgba(73,48,140,0.4))`,
        background: `linear-gradient(180deg, ${c.base}14 0%, rgba(16,7,38,0.5) 60%)`,
        display: "flex",
        flexDirection: "column",
        minHeight: 400,
      }}
    >
      {/* Column header */}
      <div
        style={{
          padding: "14px 14px 12px",
          borderBottom: `1px solid color-mix(in oklch, ${c.base} 25%, transparent)`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusDot status={status} size={10} glow />
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.28em",
                color: c.ink,
                textTransform: "uppercase",
                fontWeight: 700,
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {status}
            </div>
          </div>
          <div
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              background: `color-mix(in oklch, ${c.base} 22%, transparent)`,
              color: c.ink,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {accounts.length}
          </div>
        </div>
      </div>

      {/* Cards */}
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {accounts.map((item) => (
          <StageCard
            key={`${item.account._tab}_${item.account._rowIndex}`}
            account={item.account}
            lastContactDate={item.lastContactDate}
            tweaks={tweaks}
          />
        ))}
        {accounts.length === 0 && (
          <div
            style={{
              padding: "26px 12px",
              textAlign: "center",
              border: "1px dashed rgba(73,48,140,0.4)",
              borderRadius: 10,
              color: "#5a4a8a",
              fontSize: 11,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            No accounts here
          </div>
        )}
      </div>
    </div>
  );
}

function StageCard({
  account,
  lastContactDate,
  tweaks,
}: {
  account: AnyAccount;
  lastContactDate: string;
  tweaks: PipelineTweaks;
}) {
  const touch = formatContactPipeline(lastContactDate);
  const temp = tempLabelPipeline(touch.days, account._tabSlug);
  const isStale = temp.tone === "cold";
  const isHot = temp.tone === "hot";
  const glow = isStale
    ? "0 0 0 1px rgba(255,124,112,0.4), 0 0 16px rgba(255,124,112,0.25)"
    : isHot
    ? "0 0 0 1px rgba(100,245,234,0.3), 0 0 14px rgba(100,245,234,0.18)"
    : "none";
  const href = `/accounts/${account._tabSlug}/${account._rowIndex}`;

  return (
    <Link
      href={href}
      aria-label={`Open ${account.account}`}
      style={{
        display: "block",
        padding: 11,
        borderRadius: 10,
        border: "1px solid rgba(73,48,140,0.45)",
        background: "linear-gradient(180deg, rgba(26,15,69,0.6), rgba(16,7,38,0.55))",
        boxShadow: tweaks.neon ? glow : "none",
        cursor: "pointer",
        transition: "transform 120ms ease",
        textDecoration: "none",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)")}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#fff4e8",
            fontFamily: "'Space Grotesk', sans-serif",
            lineHeight: 1.2,
          }}
        >
          {account.account}
        </div>
        {(() => {
          const tier = getRevenueTier("estMonthlyOrder" in account ? account.estMonthlyOrder : undefined);
          if (!tier.tier) return null;
          return (
            <span style={{ fontSize: 10, fontWeight: 800, color: tier.color, flexShrink: 0 }}>
              {tier.label}
            </span>
          );
        })()}
      </div>

      <div style={{ fontSize: 10.5, color: "#8c7fbd", marginBottom: 8, letterSpacing: 0.2 }}>
        {account.type}
        {"location" in account && account.location ? ` · ${account.location as string}` : ""}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color:
              temp.tone === "hot"
                ? "#64f5ea"
                : temp.tone === "warm"
                ? "#ffb321"
                : temp.tone === "cool"
                ? "#ffd700"
                : temp.tone === "grey"
                ? "#8c7fbd"
                : "#ff7c70",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {touch.label}
        </div>
        {account.contactName && (
          <div
            style={{
              fontSize: 10.5,
              color: "#bcaef0",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 120,
            }}
          >
            {account.contactName.split(" ")[0]}
          </div>
        )}
      </div>
    </Link>
  );
}

// Re-export PIPELINE_TABS for use in other files
export { PIPELINE_TABS };
