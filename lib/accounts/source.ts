import { AllTabsData, AnyAccount, TabName, TabSlug } from "@/types/accounts";
import { getAllTabs as getAllTabsFromSheets } from "@/lib/sheets/read";
import { TAB_NAME_TO_SLUG } from "@/lib/utils/constants";
import {
  getAccountSnapshots,
  upsertAccountSnapshots,
} from "@/lib/supabase/queries";
import {
  getAllAccounts,
  snapshotsToTabs,
  toAccountSnapshot,
} from "@/lib/accounts/snapshot";

export type AccountSource = "supabase" | "sheets";

export interface AccountsDataResult {
  data: AllTabsData;
  source: AccountSource;
}

export async function getAccountsData(): Promise<AccountsDataResult> {
  try {
    const snapshots = await getAccountSnapshots();
    if (snapshots.length > 0) {
      return {
        data: snapshotsToTabs(snapshots),
        source: "supabase",
      };
    }
  } catch (error) {
    console.warn("Unable to read Supabase accounts; falling back to Google Sheets:", error);
  }

  const data = await getAllTabsFromSheets();
  await upsertAccountSnapshots(getAllAccounts(data).map(toAccountSnapshot)).catch((error) => {
    console.warn("Unable to seed Supabase account snapshots from Google Sheets:", error);
  });

  return { data, source: "sheets" };
}

export function accountsForTab(data: AllTabsData, tab: TabName | string): AnyAccount[] {
  const tabSlug = TAB_NAME_TO_SLUG[tab as TabName] as TabSlug | undefined;
  switch (tabSlug) {
    case "restaurants":
      return data.restaurants;
    case "retail":
      return data.retail;
    case "catering":
      return data.catering;
    case "food-truck":
      return data.foodTruck;
    case "active-accounts":
      return data.activeAccounts;
    default:
      return [];
  }
}

export async function findAccountBySheetPosition(
  tab: TabName | string,
  rowIndex: number
): Promise<{ account: AnyAccount | null; source: AccountSource }> {
  const { data, source } = await getAccountsData();
  const account = accountsForTab(data, tab).find((item) => item._rowIndex === rowIndex) ?? null;
  return { account, source };
}
