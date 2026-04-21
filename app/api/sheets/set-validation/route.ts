import { NextResponse } from "next/server";
import { getSheetsClient, getSheetId } from "@/lib/sheets/client";
import { STATUS_VALUES } from "@/lib/utils/constants";
import {
  RESTAURANTS_COLUMNS,
  RETAIL_COLUMNS,
  CATERING_COLUMNS,
  FOOD_TRUCK_COLUMNS,
  ACTIVE_ACCOUNTS_COLUMNS,
} from "@/lib/sheets/schema";

export const dynamic = "force-dynamic";

const TAB_STATUS_COLUMNS: Record<string, number> = {
  Restaurants: RESTAURANTS_COLUMNS.STATUS,
  Retail: RETAIL_COLUMNS.STATUS,
  Catering: CATERING_COLUMNS.STATUS,
  "Food Truck": FOOD_TRUCK_COLUMNS.STATUS,
  "Active Accounts": ACTIVE_ACCOUNTS_COLUMNS.STATUS,
};

export async function POST() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !process.env.GOOGLE_SHEET_ID) {
    return NextResponse.json({ error: "Google Sheets not configured" }, { status: 503 });
  }

  try {
    const sheets = getSheetsClient();
    const spreadsheetId = getSheetId();

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties",
    });

    const sheetIdByTitle: Record<string, number> = {};
    for (const sheet of spreadsheet.data.sheets ?? []) {
      const title = sheet.properties?.title;
      const id = sheet.properties?.sheetId;
      if (title && typeof id === "number") sheetIdByTitle[title] = id;
    }

    const requests = Object.entries(TAB_STATUS_COLUMNS).flatMap(([tabName, colIndex]) => {
      const sheetId = sheetIdByTitle[tabName];
      if (typeof sheetId !== "number") return [];
      return [
        {
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: 1, // skip header row (0-indexed)
              startColumnIndex: colIndex,
              endColumnIndex: colIndex + 1,
            },
            rule: {
              condition: {
                type: "ONE_OF_LIST",
                values: STATUS_VALUES.map((v) => ({ userEnteredValue: v })),
              },
              showCustomUi: true,
              strict: false,
            },
          },
        },
      ];
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });

    return NextResponse.json({ ok: true, tabsUpdated: requests.length });
  } catch (error) {
    console.error("Set validation error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
