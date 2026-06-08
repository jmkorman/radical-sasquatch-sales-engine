import { getSheetsClient, getSheetId } from "./client";
import {
  indexToColumnLetter,
  assertHeaderRow,
  headerValidationEnabled,
  getExpectedHeaders,
} from "./schema";

// Per-tab in-process cache of "we validated this tab's header at time T".
// Keeps the validation cost off the per-cell hot path while still catching a
// drifted column on the first call within each 5-minute window.
const HEADER_CACHE_MS = 5 * 60 * 1000;
const headerValidatedAt = new Map<string, number>();

async function ensureHeadersValid(tabName: string): Promise<void> {
  if (!headerValidationEnabled()) return;
  // Unknown tabs (e.g. notion_tasks-style sheets) have no expected map; skip.
  if (!getExpectedHeaders(tabName)) return;

  const now = Date.now();
  const last = headerValidatedAt.get(tabName);
  if (last && now - last < HEADER_CACHE_MS) return;

  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `'${tabName}'!A1:Z1`,
  });
  const header = (response.data.values?.[0] as unknown[] | undefined) ?? [];
  // Throws SheetHeaderMismatchError on mismatch — surfaces to the caller so
  // the API route can fail loud before mutating a misaligned column.
  assertHeaderRow(tabName, header);
  headerValidatedAt.set(tabName, now);
}

// Exposed for tests; intentionally not part of the public sheet API.
export function __resetHeaderCacheForTests(): void {
  headerValidatedAt.clear();
}

/**
 * Update a single cell in the Google Sheet.
 * This is the ONLY function that writes to the sheet.
 * Never overwrites a whole row - cell-by-cell only.
 */
export async function updateCell(
  tabName: string,
  rowIndex: number,
  columnIndex: number,
  value: string
): Promise<void> {
  await ensureHeadersValid(tabName);
  const sheets = getSheetsClient();
  const colLetter = indexToColumnLetter(columnIndex);
  const range = `'${tabName}'!${colLetter}${rowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
}

export async function getCellValue(
  tabName: string,
  rowIndex: number,
  columnIndex: number
): Promise<string> {
  const sheets = getSheetsClient();
  const colLetter = indexToColumnLetter(columnIndex);
  const range = `'${tabName}'!${colLetter}${rowIndex}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range,
  });

  return (response.data.values?.[0]?.[0] as string | undefined) ?? "";
}

/**
 * Update multiple cells in sequence for the same row.
 * Each cell is updated individually - never a bulk row overwrite.
 */
export async function updateCells(
  tabName: string,
  rowIndex: number,
  updates: { columnIndex: number; value: string }[]
): Promise<void> {
  for (const update of updates) {
    await updateCell(tabName, rowIndex, update.columnIndex, update.value);
  }
}

export async function appendRow(tabName: string, values: string[]): Promise<string | null> {
  await ensureHeadersValid(tabName);
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `'${tabName}'!A:Z`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });

  return response.data.updates?.updatedRange ?? null;
}

export async function deleteRow(tabName: string, rowIndex: number): Promise<void> {
  await ensureHeadersValid(tabName);
  const sheets = getSheetsClient();
  const spreadsheetId = getSheetId();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });
  const sheetId = spreadsheet.data.sheets?.find(
    (sheet) => sheet.properties?.title === tabName
  )?.properties?.sheetId;

  if (typeof sheetId !== "number") {
    throw new Error(`Unable to find sheet id for tab: ${tabName}`);
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        },
      ],
    },
  });
}
