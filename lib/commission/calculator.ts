import { AllTabsData, AnyAccount, ActiveAccount } from "@/types/accounts";

function getMonthlyOrder(account: AnyAccount): number {
  if ("estMonthlyOrder" in account) {
    return parseFloat((account.estMonthlyOrder ?? "").replace(/[$,]/g, "")) || 0;
  }
  if ("order" in account) {
    return parseFloat(((account as ActiveAccount).order ?? "").replace(/[$,]/g, "")) || 0;
  }
  return 0;
}

function getCommissionRate(account: AnyAccount): number {
  if ("commissionPct" in account) {
    const raw = (account.commissionPct ?? "").replace(/%/g, "");
    const parsed = parseFloat(raw);
    return isNaN(parsed) ? 10 : parsed;
  }
  return 10;
}

export function calculateCommission(data: AllTabsData): number {
  const allAccounts: AnyAccount[] = [
    ...data.restaurants,
    ...data.retail,
    ...data.catering,
    ...data.foodTruck,
    ...data.activeAccounts,
  ];

  return allAccounts
    .filter((a) => a.status === "Closed - Won")
    .reduce((sum, account) => {
      const monthly = getMonthlyOrder(account);
      const rate = getCommissionRate(account) / 100;
      return sum + monthly * rate;
    }, 0);
}

export function getStatusCounts(data: AllTabsData): Record<string, number> {
  const allAccounts: AnyAccount[] = [
    ...data.restaurants,
    ...data.retail,
    ...data.catering,
    ...data.foodTruck,
    ...data.activeAccounts,
  ];

  const counts: Record<string, number> = {
    Identified: 0,
    Researched: 0,
    Contacted: 0,
    "Following Up": 0,
    "Closed - Won": 0,
    "": 0,
  };

  for (const a of allAccounts) {
    const s = a.status || "";
    counts[s] = (counts[s] || 0) + 1;
  }

  return counts;
}
