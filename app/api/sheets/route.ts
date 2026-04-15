import { NextResponse } from "next/server";
import { getAllTabs } from "@/lib/sheets/read";
import { AllTabsData } from "@/types/accounts";

const EMPTY_DATA: AllTabsData = {
  restaurants: [],
  retail: [],
  catering: [],
  foodTruck: [],
  activeAccounts: [],
};

export async function GET() {
  // Return empty data if Google Sheets isn't configured yet
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !process.env.GOOGLE_SHEET_ID) {
    return NextResponse.json(EMPTY_DATA);
  }

  try {
    const data = await getAllTabs();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate" },
    });
  } catch (error) {
    console.error("Sheets read error:", error);
    return NextResponse.json(EMPTY_DATA);
  }
}
