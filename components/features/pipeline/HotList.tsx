"use client";

import { useState, useMemo } from "react";
import { AllTabsData, AnyAccount } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { PipelineTweaks } from "@/types/pipeline";
import { LogOutreachModal } from "@/components/features/dashboard/LogOutreachModal";
import { useSheetStore } from "@/stores/useSheetStore";
import { useUIStore } from "@/stores/useUIStore";
import { persistActivityEntry } from "@/lib/activity/persist";
import { todayISO } from "@/lib/utils/dates";
import {
  urgencyScore,
  parseDollarsPipeline,
  formatContactPipeline,
  tempLabelPipeline,
  daysSincePipeline,
  getForPipelineTab,
  getAllPipelineAccounts,
  STATUS_PALETTE,
  PipelineTabName,
} from "@/lib/pipeline/urgency";
import { StatusPill } from "./StatusIndicators";
import { PipelineSubTabs } from "./CommandTable";

export function HotList({
  data,
  tweaks,
}: {
  data: AllTabsData;
  tweaks: PipelineTweaks;
}) {
  const [activeTab, setActiveTab] = useState<PipelineTabName>("All");
  const [modalAccount, setModalAccount] = useState<AnyAccount | null>(null);

  const { fetchAllTabs } = useSheetStore();
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);

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

  const ranked = useMemo(() => {
    const all = getForPipelineTab(data, activeTab);
    return all
      .filter((a) => a.status !== "Closed - Won")
      .map((a) => ({ a, score: urgencyScore(a) }))
      .sort((x, y) => y.score - x.score);
  }, [data, activeTab]);

  const today = ranked.slice(0, 3);
  const thisWeek = ranked.slice(3, 8);
  const onDeck = ranked.slice(8);

  const totalPotential = ranked.slice(0, 8).reduce(
    (sum, r) =>
      sum + parseDollarsPipeline("estMonthlyOrder" in r.a ? (r.a.estMonthlyOrder as string) : ""),
    0
  );

  const activeDeals = ranked.filter(
    (r) => r.a.status === "Following Up" || r.a.status === "Contacted"
  ).length;

  const goingStale = ranked.filter(
    (r) => (daysSincePipeline(r.a.contactDate) ?? 0) > 14
  ).length;

  const todayDate = new Date();
  const todayLabel = todayDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

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

    void log;

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
    <div>
      <PipelineSubTabs value={activeTab} setValue={setActiveTab} counts={tabCounts} />

      {/* Intention banner */}
      <div
        style={{
          marginTop: 18,
          padding: "22px 26px",
          borderRadius: 18,
          border: "1px solid rgba(100,245,234,0.3)",
          background:
            "linear-gradient(135deg, rgba(100,245,234,0.12) 0%, rgba(255,79,159,0.08) 60%, rgba(16,7,38,0.5) 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.4em",
                color: "#64f5ea",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              Today · {todayLabel}
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 900,
                color: "#fff4e8",
                fontFamily: "'Space Grotesk', sans-serif",
                letterSpacing: -0.5,
                lineHeight: 1.1,
              }}
            >
              Touch <span style={{ color: "#64f5ea" }}>{today.length}</span> account
              {today.length !== 1 ? "s" : ""}. Close{" "}
              <span style={{ color: "#ff4f9f" }}>the gap</span>.
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#bcaef0",
                marginTop: 8,
                maxWidth: 560,
                lineHeight: 1.5,
              }}
            >
              Ranked by stage × staleness × monthly value. Top three are today&apos;s priority.{" "}
              {thisWeek.length} more this week.
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <KpiBlock
              label="Top 8 potential"
              value={`$${totalPotential.toLocaleString()}`}
              accent="#64f5ea"
            />
            <KpiBlock label="Active deals" value={activeDeals} accent="#ffb321" />
            <KpiBlock label="Going stale" value={goingStale} accent="#ff7c70" />
          </div>
        </div>
      </div>

      {/* Today */}
      <HotSection label="Touch today" accent="#64f5ea" count={today.length}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
            gap: 14,
          }}
        >
          {today.map((r, i) => (
            <HotCard
              key={`${r.a._tab}_${r.a._rowIndex}`}
              account={r.a}
              rank={i + 1}
              tier="today"
              tweaks={tweaks}
              onLogOutreach={() => setModalAccount(r.a)}
            />
          ))}
        </div>
      </HotSection>

      {/* This week */}
      {thisWeek.length > 0 && (
        <HotSection label="This week" accent="#ffb321" count={thisWeek.length}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 10,
            }}
          >
            {thisWeek.map((r) => (
              <HotCard
                key={`${r.a._tab}_${r.a._rowIndex}`}
                account={r.a}
                tier="week"
                tweaks={tweaks}
                onLogOutreach={() => setModalAccount(r.a)}
              />
            ))}
          </div>
        </HotSection>
      )}

      {/* On deck */}
      {onDeck.length > 0 && (
        <HotSection label="On deck" accent="#6f64a8" count={onDeck.length}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 6,
              padding: 10,
              border: "1px solid rgba(73,48,140,0.4)",
              borderRadius: 12,
              background: "rgba(16,7,38,0.35)",
            }}
          >
            {onDeck.map((r) => {
              const c = STATUS_PALETTE[r.a.status] ?? STATUS_PALETTE[""];
              const touch = formatContactPipeline(r.a.contactDate);
              return (
                <div
                  key={`${r.a._tab}_${r.a._rowIndex}`}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: c.base,
                        boxShadow: `0 0 6px ${c.glow}`,
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "#fff4e8",
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.a.account}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: "#8c7fbd",
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}
                  >
                    {touch.label}
                  </span>
                </div>
              );
            })}
          </div>
        </HotSection>
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

function KpiBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div
      style={{
        padding: "10px 14px",
        border: "1px solid rgba(73,48,140,0.6)",
        borderRadius: 12,
        background: "rgba(16,7,38,0.5)",
        minWidth: 120,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: "0.3em",
          color: "#bcaef0",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: accent,
          fontFamily: "'Space Grotesk', sans-serif",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function HotSection({
  label,
  accent,
  count,
  children,
}: {
  label: string;
  accent: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: accent,
            boxShadow: `0 0 8px ${accent}88`,
            flexShrink: 0,
          }}
        />
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.36em",
            color: accent,
            textTransform: "uppercase",
            fontWeight: 700,
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {label}
        </div>
        <div
          style={{ fontSize: 11, color: "#8c7fbd", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {count}
        </div>
        <div
          style={{
            flex: 1,
            height: 1,
            background: `linear-gradient(90deg, ${accent}55, transparent)`,
          }}
        />
      </div>
      {children}
    </div>
  );
}

function HotCard({
  account,
  rank,
  tier,
  tweaks,
  onLogOutreach,
}: {
  account: AnyAccount;
  rank?: number;
  tier: "today" | "week";
  tweaks: PipelineTweaks;
  onLogOutreach: () => void;
}) {
  const touch = formatContactPipeline(account.contactDate);
  const temp = tempLabelPipeline(touch.days);
  const dollars = parseDollarsPipeline(
    "estMonthlyOrder" in account ? (account.estMonthlyOrder as string) : ""
  );
  const c = STATUS_PALETTE[account.status] ?? STATUS_PALETTE[""];
  const isBig = tier === "today";

  return (
    <div
      style={{
        padding: isBig ? 18 : 14,
        borderRadius: 14,
        border: `1px solid color-mix(in oklch, ${c.base} 35%, rgba(73,48,140,0.5))`,
        background: `linear-gradient(180deg, ${c.base}18 0%, rgba(16,7,38,0.6) 80%)`,
        boxShadow: tweaks.neon && isBig ? `0 0 0 1px ${c.glow}, 0 10px 30px rgba(0,0,0,0.3)` : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {rank && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            fontSize: 38,
            fontWeight: 900,
            color: c.base,
            opacity: 0.25,
            fontFamily: "'Space Grotesk', sans-serif",
            lineHeight: 1,
          }}
        >
          #{rank}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <StatusPill status={account.status} />
        {temp.tone === "cold" && touch.days !== null && touch.days > 14 && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#ff7c70",
              letterSpacing: 0.4,
              textTransform: "uppercase",
              fontFamily: "'Space Grotesk', sans-serif",
              padding: "3px 8px",
              border: "1px solid rgba(255,124,112,0.35)",
              borderRadius: 999,
            }}
          >
            {touch.days}d stale
          </span>
        )}
      </div>

      <div
        style={{
          fontSize: isBig ? 20 : 16,
          fontWeight: 800,
          color: "#fff4e8",
          fontFamily: "'Space Grotesk', sans-serif",
          lineHeight: 1.15,
          letterSpacing: -0.2,
        }}
      >
        {account.account}
      </div>
      <div style={{ fontSize: 12, color: "#bcaef0", marginTop: 4 }}>
        {account.type}
        {"location" in account && account.location ? ` · ${account.location as string}` : ""}
        {account.contactName ? ` · ${account.contactName}` : ""}
      </div>

      {isBig && account.nextSteps && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background: "rgba(255,179,33,0.06)",
            border: "1px solid rgba(255,179,33,0.25)",
          }}
        >
          <div
            style={{
              fontSize: 9.5,
              letterSpacing: "0.32em",
              color: "#ffb321",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Next step
          </div>
          <div style={{ fontSize: 13, color: "#fff4e8", lineHeight: 1.5 }}>
            {account.nextSteps}
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 14,
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{ display: "flex", gap: 14, fontSize: 11, fontFamily: "'Space Grotesk', sans-serif" }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                color: "#8c7fbd",
                letterSpacing: 0.6,
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Last
            </div>
            <div
              style={{
                color:
                  temp.tone === "hot"
                    ? "#64f5ea"
                    : temp.tone === "warm"
                    ? "#ffb321"
                    : "#ff7c70",
                fontWeight: 700,
              }}
            >
              {touch.label}
            </div>
          </div>
          {dollars > 0 && tweaks.showDollars && (
            <div>
              <div
                style={{
                  fontSize: 9,
                  color: "#8c7fbd",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Monthly
              </div>
              <div style={{ color: "#64f5ea", fontWeight: 700 }}>
                {"estMonthlyOrder" in account ? (account.estMonthlyOrder as string) : ""}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {account.phone && (
            <a
              href={`tel:${account.phone}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                border: "1px solid rgba(73,48,140,0.6)",
                background: "rgba(255,255,255,0.03)",
                color: "#bcaef0",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                textDecoration: "none",
              }}
              title="Call"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </a>
          )}
          {account.email && (
            <a
              href={`mailto:${account.email}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                border: "1px solid rgba(73,48,140,0.6)",
                background: "rgba(255,255,255,0.03)",
                color: "#bcaef0",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                textDecoration: "none",
              }}
              title="Email"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </a>
          )}
          <button
            onClick={onLogOutreach}
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              border: "1px solid rgba(100,245,234,0.5)",
              background: "rgba(100,245,234,0.15)",
              color: "#64f5ea",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
            title="Log outreach"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
