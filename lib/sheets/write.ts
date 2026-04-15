import { getSheetsClient, getSheetId } from "./client";
import { indexToColumnLetter } from "./schema";

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
