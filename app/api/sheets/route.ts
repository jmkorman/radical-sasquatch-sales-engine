import { NextResponse } from "next/server";
import { AllTabsData } from "@/types/accounts";
import { getAccountsData } from "@/lib/accounts/source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EMPTY_DATA: AllTabsData = {
  restaurants: [],
  retail: [],
  catering: [],
  foodTruck: [],
  activeAccounts: [],
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  try {
    const { data, source } = await getAccountsData();
    return NextResponse.json(data, {
      headers: {
        ...NO_STORE_HEADERS,
        "X-Account-Source": source,
      },
    });
  } catch (error) {
    console.error("Account data read error:", error);
    return NextResponse.json(EMPTY_DATA, { headers: NO_STORE_HEADERS });
  }
}
