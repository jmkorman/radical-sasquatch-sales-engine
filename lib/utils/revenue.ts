// Revenue tier utility — uses estMonthlyOrder field to assign S/M/L tier
// Tier 1 ($): < $500/mo
// Tier 2 ($$): $500–$1,499/mo
// Tier 3 ($$$): $1,500+/mo

export type RevenueTier = 1 | 2 | 3;

export interface RevenueTierInfo {
  tier: RevenueTier | null;
  label: string;
  color: string;
  dots: number;
}

export function getRevenueTier(estMonthlyOrder: string | undefined): RevenueTierInfo {
  if (!estMonthlyOrder) return { tier: null, label: "—", color: "#5a4a8a", dots: 0 };
  const amount = parseInt((estMonthlyOrder || "$0").replace(/[^0-9]/g, ""), 10) || 0;
  if (amount <= 0)    return { tier: null, label: "—",   color: "#5a4a8a", dots: 0 };
  if (amount < 500)   return { tier: 1,    label: "$",   color: "#8c7fbd", dots: 1 };
  if (amount < 1500)  return { tier: 2,    label: "$$",  color: "#64f5ea", dots: 2 };
  return               { tier: 3,          label: "$$$", color: "#ffb321", dots: 3 };
}
