import { AnyAccount, AllTabsData } from "@/types/accounts";
import { calendarDaysBetween, parseAppDate } from "@/lib/utils/dates";
import { CHANNEL_URGENCY_THRESHOLDS } from "@/lib/utils/constants";

// Kanban column order — current stages first, then legacy stages for backward compat
export const PIPELINE_STATUSES = [
  "Identified",
  "Reached Out",
  "Connected",
  "Sample Sent",
  "Tasting Complete",
  "Decision Pending",
  "Backburner",
  "Not a Fit",
  // Legacy (so existing sheet data still renders in kanban)
  "Researched",
  "Contacted",
  "Following Up",
  "Closed - Won",
  "Not Interested",
] as const;

// Visible kanban columns (exclude legacy from the board display)
export const ACTIVE_PIPELINE_STATUSES = [
  "Identified",
  "Reached Out",
  "Connected",
  "Sample Sent",
  "Tasting Complete",
  "Decision Pending",
  "Backburner",
  "Not a Fit",
] as const;

export const STATUS_PALETTE: Record<string, { base: string; glow: string; ink: string }> = {
  // Current stages
  "Identified":         { base: "#6f64a8", glow: "rgba(111,100,168,0.45)", ink: "#e2dcff" },
  "Reached Out":        { base: "#4d8cff", glow: "rgba(77,140,255,0.45)",  ink: "#d8e6ff" },
  "Connected":          { base: "#ffb321", glow: "rgba(255,179,33,0.45)",  ink: "#fff1d0" },
  "Sample Sent":        { base: "#64f5ea", glow: "rgba(100,245,234,0.45)", ink: "#d0faf7" },
  "Tasting Complete":   { base: "#a78bfa", glow: "rgba(167,139,250,0.45)", ink: "#ede9fe" },
  "Decision Pending":   { base: "#f97316", glow: "rgba(249,115,22,0.45)",  ink: "#ffeedd" },
  "Backburner":         { base: "#8c7fbd", glow: "rgba(140,127,189,0.45)", ink: "#d4c8f0" },
  "Not a Fit":          { base: "#6b3c3c", glow: "rgba(107,60,60,0.45)",   ink: "#e8d5d5" },
  // Legacy stages
  "Researched":         { base: "#4d8cff", glow: "rgba(77,140,255,0.45)",  ink: "#d8e6ff" },
  "Contacted":          { base: "#ffb321", glow: "rgba(255,179,33,0.45)",  ink: "#fff1d0" },
  "Following Up":       { base: "#ff7c70", glow: "rgba(255,124,112,0.45)", ink: "#ffe0dc" },
  "Closed - Won":       { base: "#44d39f", glow: "rgba(68,211,159,0.45)",  ink: "#c8f5e2" },
  "Not Interested":     { base: "#6b3c3c", glow: "rgba(107,60,60,0.45)",   ink: "#e8d5d5" },
  "":                   { base: "#4a3a7a", glow: "rgba(74,58,122,0.45)",   ink: "#bbb2de" },
};

export const STATUS_ORDER: Record<string, number> = {
  // Current stages (most actionable first)
  "Decision Pending": 0,
  "Tasting Complete": 1,
  "Sample Sent":      2,
  "Connected":        3,
  "Reached Out":      4,
  "Identified":       5,
  "Backburner":       6,
  "Not a Fit":        7,
  // Legacy
  "Following Up":     0,
  "Contacted":        3,
  "Researched":       5,
  "Closed - Won":     8,
  "Not Interested":   9,
  "":                 10,
};

export function daysSincePipeline(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = parseAppDate(dateStr);
  if (!d) return null;
  return Math.max(0, calendarDaysBetween(d));
}

export function urgencyScore(account: AnyAccount, contactDate = account.contactDate): number {
  const days = daysSincePipeline(contactDate);
  const stageWeights: Record<string, number> = {
    // Current stages
    "Decision Pending":  50,
    "Tasting Complete":  45,
    "Sample Sent":       40,
    "Connected":         35,
    "Reached Out":       25,
    "Identified":        8,
    "Backburner":        1,
    "Not a Fit":         0,
    // Legacy
    "Following Up":      40,
    "Contacted":         30,
    "Researched":        15,
    "Closed - Won":      2,
    "Not Interested":    0,
    "":                  8,
  };
  const sw = stageWeights[account.status] ?? 8;
  const dollars = parseDollarsPipeline("estMonthlyOrder" in account ? (account.estMonthlyOrder as string) : "");
  const dollarWeight = Math.min(30, dollars / 300);

  // Channel-specific staleness decay
  const channel = account._tabSlug ?? "default";
  const thresholds = CHANNEL_URGENCY_THRESHOLDS[channel] ?? CHANNEL_URGENCY_THRESHOLDS.default;
  const stale = days === null ? 20 : Math.min(50, days * (14 / thresholds.stale) * 1.6);

  return sw + dollarWeight + stale;
}

export function activityScore(account: AnyAccount, contactDate = account.contactDate): number {
  const days = daysSincePipeline(contactDate);
  const stageWeights: Record<string, number> = {
    // Current stages
    "Decision Pending":  1200,
    "Tasting Complete":  1150,
    "Sample Sent":       1100,
    "Connected":         1050,
    "Reached Out":       800,
    "Identified":        420,
    "Backburner":        80,
    "Not a Fit":         0,
    // Legacy
    "Following Up":      1100,
    "Contacted":         1080,
    "Researched":        600,
    "Closed - Won":      120,
    "Not Interested":    0,
    "":                  220,
  };
  const stageWeight = stageWeights[account.status] ?? 220;
  const recencyWeight = days === null ? 0 : Math.max(0, 220 - days * 18);
  const nextStepWeight = account.nextSteps?.trim() ? 35 : 0;
  const dollars = parseDollarsPipeline("estMonthlyOrder" in account ? (account.estMonthlyOrder as string) : "");
  const dollarWeight = Math.min(90, dollars / 120);

  return stageWeight + recencyWeight + nextStepWeight + dollarWeight;
}

export function parseDollarsPipeline(s: string): number {
  return parseInt((s || "$0").replace(/[^0-9]/g, ""), 10) || 0;
}

export interface ContactInfoPipeline {
  label: string;
  days: number | null;
}

export function formatContactPipeline(dateStr: string): ContactInfoPipeline {
  const days = daysSincePipeline(dateStr);
  if (days === null) return { label: "Never contacted", days: null };
  if (days === 0) return { label: "Today", days };
  if (days === 1) return { label: "Yesterday", days };
  if (days <= 7) return { label: `${days}d ago`, days };
  const d = parseAppDate(dateStr);
  if (!d) return { label: dateStr, days };
  return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), days };
}

export interface TempInfoPipeline {
  label: string;
  tone: "hot" | "warm" | "cool" | "cold" | "grey";
}

export function tempLabelPipeline(days: number | null, tabSlug?: string): TempInfoPipeline {
  if (days === null) return { label: "Never contacted", tone: "grey" };
  if (days === 0) return { label: "Touched today", tone: "hot" };
  const channel = tabSlug ?? "default";
  const t = CHANNEL_URGENCY_THRESHOLDS[channel] ?? CHANNEL_URGENCY_THRESHOLDS.default;
  if (days <= t.hot)     return { label: "Fresh",             tone: "hot" };
  if (days <= t.warm)    return { label: "Warm",              tone: "warm" };
  if (days <= t.cooling) return { label: "Cooling",           tone: "cool" };
  return { label: `Stale — ${days}d`, tone: "cold" };
}

export interface ContactAgeVisualPipeline {
  color: string;
  filledSegments: number;
}

export function getContactAgeVisualPipeline(days: number | null, tabSlug?: string): ContactAgeVisualPipeline {
  if (days === null) return { color: "#9ca3af", filledSegments: 0 };
  const channel = tabSlug ?? "default";
  const t = CHANNEL_URGENCY_THRESHOLDS[channel] ?? CHANNEL_URGENCY_THRESHOLDS.default;
  if (days <= t.hot)     return { color: "#4ade80", filledSegments: 10 };
  if (days <= t.warm)    return { color: "#86efac", filledSegments: 8 };
  if (days <= t.cooling) return { color: "#facc15", filledSegments: 5 };
  return { color: "#ff5f5f", filledSegments: 1 };
}

export type PipelineTabName = "All" | "Restaurants" | "Retail" | "Catering" | "Food Truck";

export function getAllPipelineAccounts(data: AllTabsData): AnyAccount[] {
  return [
    ...data.restaurants,
    ...data.retail,
    ...data.catering,
    ...data.foodTruck,
  ];
}

export function getForPipelineTab(data: AllTabsData, tab: PipelineTabName): AnyAccount[] {
  if (tab === "All") return getAllPipelineAccounts(data);
  if (tab === "Restaurants") return data.restaurants;
  if (tab === "Retail") return data.retail;
  if (tab === "Catering") return data.catering;
  if (tab === "Food Truck") return data.foodTruck;
  return [];
}
