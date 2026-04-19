import { NextResponse } from "next/server";
import { getAllTabs } from "@/lib/sheets/read";
import { AllTabsData } from "@/types/accounts";

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
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !process.env.GOOGLE_SHEET_ID) {
    return NextResponse.json(EMPTY_DATA, { headers: NO_STORE_HEADERS });
  }

  try {
    const data = await getAllTabs();
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Sheets read error:", error);
    return NextResponse.json(EMPTY_DATA, { headers: NO_STORE_HEADERS });
  }
}
