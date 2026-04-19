import { AnyAccount, AllTabsData } from "@/types/accounts";
import { parseAppDate } from "@/lib/utils/dates";

export const PIPELINE_STATUSES = [
  "Identified",
  "Researched",
  "Contacted",
  "Following Up",
  "Closed - Won",
] as const;

export const STATUS_PALETTE: Record<string, { base: string; glow: string; ink: string }> = {
  "Identified":   { base: "#6f64a8", glow: "rgba(111,100,168,0.45)", ink: "#e2dcff" },
  "Researched":   { base: "#4d8cff", glow: "rgba(77,140,255,0.45)",  ink: "#d8e6ff" },
  "Contacted":    { base: "#ffb321", glow: "rgba(255,179,33,0.45)",  ink: "#fff1d0" },
  "Following Up": { base: "#ff7c70", glow: "rgba(255,124,112,0.45)", ink: "#ffe0dc" },
  "Closed - Won": { base: "#44d39f", glow: "rgba(68,211,159,0.45)",  ink: "#c8f5e2" },
  "":             { base: "#4a3a7a", glow: "rgba(74,58,122,0.45)",   ink: "#bbb2de" },
};

export const STATUS_ORDER: Record<string, number> = {
  "Following Up": 0,
  "Contacted": 1,
  "Researched": 2,
  "Identified": 3,
  "Closed - Won": 4,
  "": 5,
};

export function daysSincePipeline(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = parseAppDate(dateStr);
  if (!d) return null;
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

export function urgencyScore(account: AnyAccount): number {
  const days = daysSincePipeline(account.contactDate);
  const stageWeights: Record<string, number> = {
    "Following Up": 40,
    "Contacted": 30,
    "Researched": 15,
    "Identified": 5,
    "Closed - Won": 2,
    "": 8,
  };
  const sw = stageWeights[account.status] ?? 8;
  const dollars = parseDollarsPipeline("estMonthlyOrder" in account ? (account.estMonthlyOrder as string) : "");
  const dollarWeight = Math.min(30, dollars / 300);
  const stale = days === null ? 20 : Math.min(50, days * 1.6);
  return sw + dollarWeight + stale;
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
  if (days === null) return { label: "—", days: null };
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

export function tempLabelPipeline(days: number | null): TempInfoPipeline {
  if (days === null) return { label: "Never contacted", tone: "grey" };
  if (days === 0) return { label: "Touched today", tone: "hot" };
  if (days <= 2) return { label: "Fresh", tone: "hot" };
  if (days <= 7) return { label: "Warm", tone: "warm" };
  if (days <= 14) return { label: "Cooling", tone: "cool" };
  return { label: `Stale — ${days}d`, tone: "cold" };
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
