"use client";

import { useState, useMemo } from "react";
import { AllTabsData, AnyAccount } from "@/types/accounts";
import { PipelineTweaks } from "@/types/pipeline";
import {
  PIPELINE_STATUSES,
  STATUS_PALETTE,
  urgencyScore,
  parseDollarsPipeline,
  formatContactPipeline,
  tempLabelPipeline,
  getForPipelineTab,
  getAllPipelineAccounts,
  PipelineTabName,
} from "@/lib/pipeline/urgency";
import { StatusDot } from "./StatusIndicators";
import { PipelineSubTabs } from "./CommandTable";

const PIPELINE_TABS: PipelineTabName[] = ["All", "Restaurants", "Retail", "Catering", "Food Truck"];

export function StageBoard({
  data,
  tweaks,
}: {
  data: AllTabsData;
  tweaks: PipelineTweaks;
}) {
  const [activeTab, setActiveTab] = useState<PipelineTabName>("All");
  const [search, setSearch] = useState("");

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

  const filtered = useMemo(() => {
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter(
      (a) =>
        a.account.toLowerCase().includes(q) ||
        (a.contactName || "").toLowerCase().includes(q)
    );
  }, [all, search]);

  const byStage = useMemo(() => {
    const m: Record<string, AnyAccount[]> = {};
    PIPELINE_STATUSES.forEach((s) => (m[s] = []));
    filtered.forEach((a) => {
      const s = a.status || "Identified";
      if (!m[s]) m[s] = [];
      m[s].push(a);
    });
    PIPELINE_STATUSES.forEach((s) => m[s].sort((a, b) => urgencyScore(b) - urgencyScore(a)));
    return m;
  }, [filtered]);

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
          gridTemplateColumns: "repeat(5, minmax(200px, 1fr))",
          gap: 12,
          overflowX: "auto",
        }}
      >
        {PIPELINE_STATUSES.map((s) => (
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
  accounts: AnyAccount[];
  tweaks: PipelineTweaks;
}) {
  const c = STATUS_PALETTE[status];
  const totalValue = accounts.reduce(
    (sum, a) =>
      sum + parseDollarsPipeline("estMonthlyOrder" in a ? (a.estMonthlyOrder as string) : ""),
    0
  );

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
        {tweaks.showDollars && totalValue > 0 && (
          <div
            style={{
              fontSize: 11,
              color: c.ink,
              opacity: 0.75,
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
            }}
          >
            ${totalValue.toLocaleString()}/mo potential
          </div>
        )}
      </div>

      {/* Cards */}
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {accounts.map((a) => (
          <StageCard key={`${a._tab}_${a._rowIndex}`} account={a} tweaks={tweaks} />
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
  tweaks,
}: {
  account: AnyAccount;
  tweaks: PipelineTweaks;
}) {
  const touch = formatContactPipeline(account.contactDate);
  const temp = tempLabelPipeline(touch.days);
  const dollars = parseDollarsPipeline(
    "estMonthlyOrder" in account ? (account.estMonthlyOrder as string) : ""
  );
  const isStale = temp.tone === "cold" && touch.days !== null && touch.days > 14;
  const isHot = temp.tone === "hot";
  const glow = isStale
    ? "0 0 0 1px rgba(255,124,112,0.4), 0 0 16px rgba(255,124,112,0.25)"
    : isHot
    ? "0 0 0 1px rgba(100,245,234,0.3), 0 0 14px rgba(100,245,234,0.18)"
    : "none";

  return (
    <div
      style={{
        padding: 11,
        borderRadius: 10,
        border: "1px solid rgba(73,48,140,0.45)",
        background: "linear-gradient(180deg, rgba(26,15,69,0.6), rgba(16,7,38,0.55))",
        boxShadow: tweaks.neon ? glow : "none",
        cursor: "pointer",
        transition: "transform 120ms ease",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.transform = "translateY(0)")}
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
        {dollars > 0 && tweaks.showDollars && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#64f5ea",
              fontFamily: "'Space Grotesk', sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            {"estMonthlyOrder" in account ? (account.estMonthlyOrder as string) : ""}
          </div>
        )}
      </div>

      <div style={{ fontSize: 10.5, color: "#8c7fbd", marginBottom: 8, letterSpacing: 0.2 }}>
        {account.type}
        {"location" in account && account.location ? ` · ${account.location as string}` : ""}
      </div>

      {/* Value bar */}
      {tweaks.showDollars && dollars > 0 && (
        <div
          style={{
            height: 3,
            borderRadius: 2,
            background: "rgba(73,48,140,0.3)",
            overflow: "hidden",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, (dollars / 9000) * 100)}%`,
              background: "linear-gradient(90deg, #ffb321, #64f5ea)",
              borderRadius: 2,
            }}
          />
        </div>
      )}

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
    </div>
  );
}

// Re-export PIPELINE_TABS for use in other files
export { PIPELINE_TABS };
