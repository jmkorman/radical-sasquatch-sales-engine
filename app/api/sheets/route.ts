import { NextResponse } from "next/server";
import { getAllTabs } from "@/lib/sheets/read";
import { AllTabsData } from "@/types/accounts";

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

const EMPTY_DATA: AllTabsData = {
  restaurants: [],
  retail: [],
  catering: [],
  foodTruck: [],
  activeAccounts: [],
};

let cache: { data: AllTabsData; ts: number } | null = null;

export async function GET() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !process.env.GOOGLE_SHEET_ID) {
    return NextResponse.json(EMPTY_DATA);
  }

  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const data = await getAllTabs();
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (error) {
    console.error("Sheets read error:", error);
    // Serve stale cache on error rather than returning empty data
    if (cache) return NextResponse.json(cache.data);
    return NextResponse.json(EMPTY_DATA);
  }
}
