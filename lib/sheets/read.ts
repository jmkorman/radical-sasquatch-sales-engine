import { getSheetsClient, getSheetId } from "./client";
import {
  RESTAURANTS_COLUMNS,
  RETAIL_COLUMNS,
  CATERING_COLUMNS,
  FOOD_TRUCK_COLUMNS,
  ACTIVE_ACCOUNTS_COLUMNS,
} from "./schema";
import {
  RestaurantAccount,
  RetailAccount,
  CateringAccount,
  FoodTruckAccount,
  ActiveAccount,
  AllTabsData,
  StatusValue,
} from "@/types/accounts";

function cell(row: string[], index: number): string {
  return row[index] ?? "";
}

function shouldIncludeAccount(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized !== "" && normalized !== "targets" && normalized !== "total" && normalized !== "totals";
}

function toStatus(val: string): StatusValue {
  const valid = ["Identified", "Researched", "Contacted", "Following Up", "Closed - Won"];
  return valid.includes(val) ? (val as StatusValue) : "";
}

function mapRestaurant(row: string[], rowIndex: number): RestaurantAccount {
  const c = RESTAURANTS_COLUMNS;
  return {
    _rowIndex: rowIndex,
    _tab: "Restaurants",
    _tabSlug: "restaurants",
    account: cell(row, c.ACCOUNT),
    type: cell(row, c.TYPE),
    location: cell(row, c.LOCATION),
    ig: cell(row, c.IG),
    website: cell(row, c.WEBSITE),
    kitchen: cell(row, c.KITCHEN),
    dumplings: cell(row, c.DUMPLINGS),
    status: toStatus(cell(row, c.STATUS)),
    nextSteps: cell(row, c.NEXT_STEPS),
    contactDate: cell(row, c.CONTACT_DATE),
    contactName: cell(row, c.CONTACT_NAME),
    phone: cell(row, c.PHONE),
    email: cell(row, c.EMAIL),
    estMonthlyOrder: cell(row, c.EST_MONTHLY_ORDER),
    commissionPct: cell(row, c.COMMISSION_PCT),
    notes: cell(row, c.NOTES),
  };
}

function mapRetail(row: string[], rowIndex: number): RetailAccount {
  const c = RETAIL_COLUMNS;
  return {
    _rowIndex: rowIndex,
    _tab: "Retail",
    _tabSlug: "retail",
    account: cell(row, c.ACCOUNT),
    type: cell(row, c.TYPE),
    location: cell(row, c.LOCATION),
    ig: cell(row, c.IG),
    website: cell(row, c.WEBSITE),
    status: toStatus(cell(row, c.STATUS)),
    nextSteps: cell(row, c.NEXT_STEPS),
    contactDate: cell(row, c.CONTACT_DATE),
    contactName: cell(row, c.BUYER),
    phone: cell(row, c.PHONE),
    email: cell(row, c.EMAIL),
    estMonthlyOrder: cell(row, c.EST_MONTHLY_ORDER),
    commissionPct: cell(row, c.COMMISSION_PCT),
    notes: cell(row, c.NOTES),
  };
}

function mapCatering(row: string[], rowIndex: number): CateringAccount {
  const c = CATERING_COLUMNS;
  return {
    _rowIndex: rowIndex,
    _tab: "Catering",
    _tabSlug: "catering",
    account: cell(row, c.ACCOUNT),
    type: cell(row, c.TYPE),
    location: cell(row, c.LOCATION),
    ig: cell(row, c.IG),
    website: cell(row, c.WEBSITE),
    status: toStatus(cell(row, c.STATUS)),
    nextSteps: cell(row, c.NEXT_STEPS),
    contactDate: cell(row, c.CONTACT_DATE),
    contactName: cell(row, c.CONTACT_NAME),
    phone: cell(row, c.PHONE),
    email: cell(row, c.EMAIL),
    estMonthlyOrder: cell(row, c.EST_MONTHLY_ORDER),
    commissionPct: cell(row, c.COMMISSION_PCT),
    notes: cell(row, c.NOTES),
  };
}

function mapFoodTruck(row: string[], rowIndex: number): FoodTruckAccount {
  const c = FOOD_TRUCK_COLUMNS;
  return {
    _rowIndex: rowIndex,
    _tab: "Food Truck",
    _tabSlug: "food-truck",
    account: cell(row, c.ACCOUNT),
    type: cell(row, c.TYPE),
    location: cell(row, c.LOCATION),
    ig: cell(row, c.IG),
    website: cell(row, c.WEBSITE),
    status: toStatus(cell(row, c.STATUS)),
    nextSteps: cell(row, c.NEXT_STEPS),
    contactDate: cell(row, c.CONTACT_DATE),
    contactName: cell(row, c.CLIENT),
    phone: cell(row, c.PHONE),
    email: cell(row, c.EMAIL),
    estMonthlyOrder: cell(row, c.EST_MONTHLY_ORDER),
    commissionPct: cell(row, c.COMMISSION_PCT),
    notes: cell(row, c.NOTES),
  };
}

function mapActiveAccount(row: string[], rowIndex: number): ActiveAccount {
  const c = ACTIVE_ACCOUNTS_COLUMNS;
  return {
    _rowIndex: rowIndex,
    _tab: "Active Accounts",
    _tabSlug: "active-accounts",
    account: cell(row, c.ACCOUNT),
    type: cell(row, c.TYPE),
    contactName: cell(row, c.CONTACT_NAME),
    status: toStatus(cell(row, c.STATUS)),
    rsLead: cell(row, c.RS_LEAD),
    contactDate: cell(row, c.CONTACT_DATE),
    nextSteps: cell(row, c.NEXT_STEPS),
    phone: cell(row, c.PHONE),
    email: cell(row, c.EMAIL),
    order: cell(row, c.ORDER),
    notes: cell(row, c.NOTES),
  };
}

async function getTabRaw(tabName: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `'${tabName}'!A:Z`,
  });
  return (response.data.values as string[][]) ?? [];
}

export async function getRestaurants(): Promise<RestaurantAccount[]> {
  const rows = await getTabRaw("Restaurants");
  if (rows.length <= 1) return [];
  return rows
    .slice(1)
    .map((row, i) => mapRestaurant(row, i + 2))
    .filter((a) => shouldIncludeAccount(a.account));
}

export async function getRetail(): Promise<RetailAccount[]> {
  const rows = await getTabRaw("Retail");
  if (rows.length <= 1) return [];
  return rows
    .slice(1)
    .map((row, i) => mapRetail(row, i + 2))
    .filter((a) => shouldIncludeAccount(a.account));
}

export async function getCatering(): Promise<CateringAccount[]> {
  const rows = await getTabRaw("Catering");
  if (rows.length <= 1) return [];
  return rows
    .slice(1)
    .map((row, i) => mapCatering(row, i + 2))
    .filter((a) => shouldIncludeAccount(a.account));
}

export async function getFoodTruck(): Promise<FoodTruckAccount[]> {
  const rows = await getTabRaw("Food Truck");
  if (rows.length <= 1) return [];
  return rows
    .slice(1)
    .map((row, i) => mapFoodTruck(row, i + 2))
    .filter((a) => shouldIncludeAccount(a.account));
}

export async function getActiveAccounts(): Promise<ActiveAccount[]> {
  const rows = await getTabRaw("Active Accounts");
  if (rows.length <= 1) return [];
  return rows
    .slice(1)
    .map((row, i) => mapActiveAccount(row, i + 2))
    .filter((a) => shouldIncludeAccount(a.account));
}

export async function getAllTabs(): Promise<AllTabsData> {
  const [restaurants, retail, catering, foodTruck, activeAccounts] =
    await Promise.all([
      getRestaurants(),
      getRetail(),
      getCatering(),
      getFoodTruck(),
      getActiveAccounts(),
    ]);
  return { restaurants, retail, catering, foodTruck, activeAccounts };
}
