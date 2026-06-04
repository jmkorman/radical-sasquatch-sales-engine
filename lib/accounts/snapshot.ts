import {
  ActiveAccount,
  AllTabsData,
  AnyAccount,
  CateringAccount,
  FoodTruckAccount,
  RestaurantAccount,
  RetailAccount,
  StatusValue,
  TabName,
  TabSlug,
} from "@/types/accounts";
import { getAccountPrimaryId, normalizeAccountName } from "@/lib/accounts/identity";
import { TAB_SLUG_MAP } from "@/lib/utils/constants";

export interface AccountSnapshot {
  id: string;
  account_name: string;
  tab: string;
  tab_slug: string;
  row_index: number;
  type: string | null;
  location: string | null;
  status: string | null;
  next_steps: string | null;
  next_action_type: string | null;
  contact_date: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  est_monthly_order: string | null;
  notes: string | null;
  raw: Record<string, unknown>;
  updated_at: string;
}

export function toAccountSnapshot(account: AnyAccount): AccountSnapshot {
  return {
    id: account.id || getAccountPrimaryId(account),
    account_name: account.account,
    tab: account._tab,
    tab_slug: account._tabSlug,
    row_index: account._rowIndex,
    type: account.type || null,
    location: "location" in account ? account.location || null : null,
    status: account.status || null,
    next_steps: account.nextSteps || null,
    next_action_type: account.nextActionType || null,
    contact_date: account.contactDate || null,
    contact_name: account.contactName || null,
    phone: account.phone || null,
    email: account.email || null,
    est_monthly_order: "estMonthlyOrder" in account ? account.estMonthlyOrder || null : null,
    notes: account.notes || null,
    raw: account as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Auto-created accounts whose inference confidence landed in the review band
 * (70–84) are flagged `review_pending` in their raw payload. They live in
 * Supabase but are hidden from the pipeline tabs until Jake approves them in
 * Settings → Pending Review.
 */
export function isPendingReview(snapshot: AccountSnapshot): boolean {
  const raw = (snapshot.raw ?? {}) as Record<string, unknown>;
  return raw.review_pending === true;
}

function cleanSnapshotValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cleanStatus(value: unknown): StatusValue {
  return cleanSnapshotValue(value) as StatusValue;
}

function normalizeTabSlug(tabSlug: string): TabSlug {
  if (tabSlug in TAB_SLUG_MAP) return tabSlug as TabSlug;
  return "restaurants";
}

function sortByRowIndex<T extends AnyAccount>(accounts: T[]): T[] {
  return [...accounts].sort((a, b) => {
    if (a._rowIndex !== b._rowIndex) return a._rowIndex - b._rowIndex;
    return a.account.localeCompare(b.account);
  });
}

export function getAllAccounts(data: AllTabsData): AnyAccount[] {
  return [
    ...data.restaurants,
    ...data.retail,
    ...data.catering,
    ...data.foodTruck,
    ...data.activeAccounts,
  ];
}

export function snapshotToAccount(snapshot: AccountSnapshot): AnyAccount {
  const raw = (snapshot.raw ?? {}) as Record<string, unknown>;
  const tabSlug = normalizeTabSlug(snapshot.tab_slug);
  const tab = (snapshot.tab || TAB_SLUG_MAP[tabSlug]) as TabName;
  const rowIndex = Number(snapshot.row_index) || Number(raw._rowIndex) || 0;

  const common = {
    id: snapshot.id,
    _rowIndex: rowIndex,
    _tab: tab,
    _tabSlug: tabSlug,
    hitListPinned: Boolean(raw.hitListPinned),
    account: snapshot.account_name || cleanSnapshotValue(raw.account),
    type: snapshot.type ?? cleanSnapshotValue(raw.type),
    status: cleanStatus(snapshot.status ?? raw.status),
    nextSteps: snapshot.next_steps ?? cleanSnapshotValue(raw.nextSteps),
    nextActionType: snapshot.next_action_type ?? cleanSnapshotValue(raw.nextActionType),
    contactDate: snapshot.contact_date ?? cleanSnapshotValue(raw.contactDate),
    contactName: snapshot.contact_name ?? cleanSnapshotValue(raw.contactName),
    phone: snapshot.phone ?? cleanSnapshotValue(raw.phone),
    email: snapshot.email ?? cleanSnapshotValue(raw.email),
    notes: snapshot.notes ?? cleanSnapshotValue(raw.notes),
  };

  if (tabSlug === "active-accounts") {
    return {
      ...common,
      _tab: "Active Accounts",
      _tabSlug: "active-accounts",
      rsLead: cleanSnapshotValue(raw.rsLead),
      order: cleanSnapshotValue(raw.order),
    } satisfies ActiveAccount;
  }

  const prospectCommon = {
    ...common,
    location: snapshot.location ?? cleanSnapshotValue(raw.location),
    estMonthlyOrder: snapshot.est_monthly_order ?? cleanSnapshotValue(raw.estMonthlyOrder),
    commissionPct: cleanSnapshotValue(raw.commissionPct),
    ig: cleanSnapshotValue(raw.ig),
    website: cleanSnapshotValue(raw.website),
  };

  if (tabSlug === "retail") {
    return {
      ...prospectCommon,
      _tab: "Retail",
      _tabSlug: "retail",
    } satisfies RetailAccount;
  }

  if (tabSlug === "catering") {
    return {
      ...prospectCommon,
      _tab: "Catering",
      _tabSlug: "catering",
    } satisfies CateringAccount;
  }

  if (tabSlug === "food-truck") {
    return {
      ...prospectCommon,
      _tab: "Food Truck",
      _tabSlug: "food-truck",
    } satisfies FoodTruckAccount;
  }

  return {
    ...prospectCommon,
    _tab: "Restaurants",
    _tabSlug: "restaurants",
    kitchen: cleanSnapshotValue(raw.kitchen),
    dumplings: cleanSnapshotValue(raw.dumplings),
  } satisfies RestaurantAccount;
}

/**
 * Dedupe snapshots by normalized account name across tabs.
 *
 * The Supabase `accounts` table is keyed by `${tabSlug}:${normalizedName}`, so
 * the same account moved (or duplicated) across tabs can leave stale rows
 * behind that point at tabs the account no longer lives in. Without this
 * dedup, names like "Harmons" can appear at the top of multiple pipeline
 * tabs because each stale snapshot is routed into its own bucket.
 *
 * Strategy: keep only the most recently updated snapshot for each normalized
 * account name. That snapshot wins because it reflects the most recent move
 * or edit the user performed.
 */
function dedupeSnapshotsByName(snapshots: AccountSnapshot[]): AccountSnapshot[] {
  const winners = new Map<string, AccountSnapshot>();
  for (const snapshot of snapshots) {
    // Key includes tab_slug so the same account name in different tabs is
    // kept — e.g. "Denver Beer Co" legitimately exists in both Restaurants
    // and Food Truck. Only true duplicates within the same tab are collapsed.
    const key = `${snapshot.tab_slug ?? ""}:${normalizeAccountName(snapshot.account_name || "")}`;
    if (!key || key === ":") continue;
    const existing = winners.get(key);
    if (!existing) {
      winners.set(key, snapshot);
      continue;
    }
    const existingTs = Date.parse(existing.updated_at || "") || 0;
    const incomingTs = Date.parse(snapshot.updated_at || "") || 0;
    if (incomingTs > existingTs) winners.set(key, snapshot);
  }
  return Array.from(winners.values());
}

export function snapshotsToTabs(snapshots: AccountSnapshot[]): AllTabsData {
  const data: AllTabsData = {
    restaurants: [],
    retail: [],
    catering: [],
    foodTruck: [],
    activeAccounts: [],
  };

  for (const snapshot of dedupeSnapshotsByName(snapshots)) {
    // Hide accounts still awaiting manual review from the pipeline tabs.
    if (isPendingReview(snapshot)) continue;
    const account = snapshotToAccount(snapshot);
    switch (account._tabSlug) {
      case "restaurants":
        data.restaurants.push(account);
        break;
      case "retail":
        data.retail.push(account);
        break;
      case "catering":
        data.catering.push(account);
        break;
      case "food-truck":
        data.foodTruck.push(account);
        break;
      case "active-accounts":
        data.activeAccounts.push(account);
        break;
    }
  }

  return {
    restaurants: sortByRowIndex(data.restaurants),
    retail: sortByRowIndex(data.retail),
    catering: sortByRowIndex(data.catering),
    foodTruck: sortByRowIndex(data.foodTruck),
    activeAccounts: sortByRowIndex(data.activeAccounts),
  };
}
