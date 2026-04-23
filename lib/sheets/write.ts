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
