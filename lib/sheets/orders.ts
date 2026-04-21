import { getSheetsClient, getSheetId } from "./client";
import { randomUUID } from "crypto";
import { indexToColumnLetter, ACTIVE_ACCOUNTS_COLUMNS } from "./schema";
import { formatDateForSheet } from "@/lib/utils/dates";
import { normalizeOrderRecord } from "@/lib/orders/helpers";
import { OrderRecord } from "@/types/orders";

const ORDERS_TAB = "Orders";
const ACTIVE_ACCOUNTS_TAB = "Active Accounts";

const ORDER_HEADERS = [
  "Order ID",
  "Account ID",
  "Account Name",
  "Pipeline Tab",
  "Source Row",
  "Account Type",
  "Contact",
  "Phone",
  "Email",
  "Order Name",
  "Order Date",
  "Due Date",
  "Delivery/Pickup Date",
  "Status",
  "Priority",
  "Owner",
  "Order Details",
  "Production Notes",
  "Amount",
  "History",
  "Created At",
  "Updated At",
] as const;

function cell(row: string[], index: number): string {
  return row[index] ?? "";
}

function amountToNumber(value: string): number {
  const cleaned = value.replace(/[$,]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nowIso() {
  return new Date().toISOString();
}

async function getSpreadsheetSheets() {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId: getSheetId(),
    fields: "sheets.properties",
  });
  return response.data.sheets ?? [];
}

export async function ensureOrdersSheet(): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetSheets = await getSpreadsheetSheets();
  const exists = spreadsheetSheets.some((sheet) => sheet.properties?.title === ORDERS_TAB);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: getSheetId(),
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: ORDERS_TAB,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `'${ORDERS_TAB}'!A1:${indexToColumnLetter(ORDER_HEADERS.length - 1)}1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...ORDER_HEADERS]] },
  });
}

function orderToRow(order: OrderRecord): string[] {
  return [
    order.id,
    order.account_id,
    order.account_name,
    order.tab,
    order.row_index ? String(order.row_index) : "",
    order.account_type ?? "",
    order.contact_name ?? "",
    order.phone ?? "",
    order.email ?? "",
    order.order_name ?? "",
    order.order_date,
    order.due_date ?? "",
    order.fulfillment_date ?? "",
    order.status,
    order.priority ?? "Normal",
    order.owner ?? "",
    order.details ?? "",
    order.production_notes ?? order.notes ?? "",
    order.amount ? String(order.amount) : "",
    order.history ?? "",
    order.created_at,
    order.updated_at ?? "",
  ];
}

function rowToOrder(row: string[], rowIndex: number): OrderRecord {
  return normalizeOrderRecord({
    id: cell(row, 0),
    account_id: cell(row, 1),
    account_name: cell(row, 2),
    tab: cell(row, 3),
    row_index: cell(row, 4) ? parseInt(cell(row, 4), 10) : null,
    account_type: cell(row, 5) || null,
    contact_name: cell(row, 6) || null,
    phone: cell(row, 7) || null,
    email: cell(row, 8) || null,
    order_name: cell(row, 9) || null,
    order_date: cell(row, 10),
    due_date: cell(row, 11) || null,
    fulfillment_date: cell(row, 12) || null,
    status: cell(row, 13) as OrderRecord["status"],
    priority: cell(row, 14) || "Normal",
    owner: cell(row, 15) || null,
    details: cell(row, 16) || null,
    production_notes: cell(row, 17) || null,
    amount: amountToNumber(cell(row, 18)),
    notes: cell(row, 17) || null,
    history: cell(row, 19) || null,
    created_at: cell(row, 20),
    updated_at: cell(row, 21) || null,
    sheet_row_index: rowIndex,
  });
}

export async function getOrdersFromSheet(accountId?: string): Promise<OrderRecord[]> {
  await ensureOrdersSheet();
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `'${ORDERS_TAB}'!A:V`,
  });

  const rows = (response.data.values as string[][] | undefined) ?? [];
  if (rows.length <= 1) return [];

  return rows
    .slice(1)
    .map((row, index) => rowToOrder(row, index + 2))
    .filter((order) => order.id && (!accountId || order.account_id === accountId));
}

function parseUpdatedRowIndex(updatedRange?: string | null): number | null {
  if (!updatedRange) return null;
  const match = updatedRange.match(/![A-Z]+(\d+):/);
  return match ? parseInt(match[1], 10) : null;
}

export async function appendOrderToSheet(order: OrderRecord): Promise<OrderRecord> {
  await ensureOrdersSheet();
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `'${ORDERS_TAB}'!A:V`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [orderToRow(order)] },
  });

  return {
    ...order,
    sheet_row_index: parseUpdatedRowIndex(response.data.updates?.updatedRange) ?? order.sheet_row_index ?? null,
  };
}

export async function updateOrderInSheet(order: OrderRecord): Promise<void> {
  await ensureOrdersSheet();
  const rowIndex =
    order.sheet_row_index ??
    (await getOrdersFromSheet()).find((candidate) => candidate.id === order.id)?.sheet_row_index;

  if (!rowIndex) return;

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `'${ORDERS_TAB}'!A${rowIndex}:V${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [orderToRow(order)] },
  });
}

export async function ensureActiveAccountForOrder(order: OrderRecord): Promise<void> {
  if (!order.account_name) return;

  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `'${ACTIVE_ACCOUNTS_TAB}'!A:K`,
  });

  const rows = (response.data.values as string[][] | undefined) ?? [];
  const target = order.account_name.trim().toLowerCase();
  const existingRowIndex = rows.findIndex((row, index) => index > 0 && cell(row, 0).trim().toLowerCase() === target);
  const orderLabel = order.order_name || order.details || "Active order";
  const orderValue = order.amount ? `$${order.amount.toFixed(0)}` : orderLabel;

  if (existingRowIndex > 0) {
    const rowNumber = existingRowIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: getSheetId(),
      range: `'${ACTIVE_ACCOUNTS_TAB}'!${indexToColumnLetter(ACTIVE_ACCOUNTS_COLUMNS.ORDER)}${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[orderValue]] },
    });
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSheetId(),
    range: `'${ACTIVE_ACCOUNTS_TAB}'!A:K`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          order.account_name,
          order.account_type ?? "",
          order.contact_name ?? "",
          "Following Up",
          order.owner ?? "",
          formatDateForSheet(order.order_date),
          `Order active: ${orderLabel}`,
          order.phone ?? "",
          order.email ?? "",
          orderValue,
          order.production_notes ?? order.details ?? "",
        ],
      ],
    },
  });
}

export function appendOrderHistory(
  existingHistory: string | null | undefined,
  message: string,
  actor = "System"
) {
  const entry = `[${new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}] ${actor}: ${message}`;
  return [entry, existingHistory].filter(Boolean).join("\n");
}

export function withOrderDefaults(entry: Partial<OrderRecord>): OrderRecord {
  const now = nowIso();
  return normalizeOrderRecord({
    id: entry.id || randomUUID(),
    created_at: entry.created_at || now,
    updated_at: now,
    status: entry.status || "New",
    priority: entry.priority || "Normal",
    ...entry,
  });
}
