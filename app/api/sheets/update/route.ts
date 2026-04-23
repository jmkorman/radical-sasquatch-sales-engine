import { NextRequest, NextResponse } from "next/server";
import { deleteRow, getCellValue, updateCell } from "@/lib/sheets/write";
import { findAccountBySheetPosition } from "@/lib/accounts/source";
import { toAccountSnapshot } from "@/lib/accounts/snapshot";
import { deleteAccountSnapshot, upsertAccountSnapshot } from "@/lib/supabase/queries";
import { AnyAccount } from "@/types/accounts";
import {
  getAccountColumnIndex,
  getStatusColumnIndex,
  getContactDateColumnIndex,
  getNextStepsColumnIndex,
  getNotesColumnIndex,
  getContactNameColumnIndex,
  getTypeColumnIndex,
  getLocationColumnIndex,
  getPhoneColumnIndex,
  getEmailColumnIndex,
  getOrderColumnIndex,
} from "@/lib/sheets/schema";
import { formatDateForSheet } from "@/lib/utils/dates";

type UpdatePayload = {
  newStatus?: string;
  contactDate?: string;
  nextSteps?: string;
  notes?: string;
  contactName?: string;
  accountName?: string;
  type?: string;
  location?: string;
  phone?: string;
  email?: string;
  order?: string;
};

function getFieldColumnIndex(tab: string, field: string): number {
  switch (field) {
    case "newStatus": return getStatusColumnIndex(tab);
    case "contactDate": return getContactDateColumnIndex(tab);
    case "nextSteps": return getNextStepsColumnIndex(tab);
    case "notes": return getNotesColumnIndex(tab);
    case "contactName": return getContactNameColumnIndex(tab);
    case "accountName": return getAccountColumnIndex(tab);
    case "type": return getTypeColumnIndex(tab);
    case "location": return getLocationColumnIndex(tab);
    case "phone": return getPhoneColumnIndex(tab);
    case "email": return getEmailColumnIndex(tab);
    case "order": return getOrderColumnIndex(tab);
    default: throw new Error(`Unknown expected field: ${field}`);
  }
}

function canSyncSheets() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.GOOGLE_SHEET_ID);
}

function getAccountFieldValue(account: AnyAccount, field: string): string {
  switch (field) {
    case "newStatus": return account.status ?? "";
    case "contactDate": return account.contactDate ?? "";
    case "nextSteps": return account.nextSteps ?? "";
    case "notes": return account.notes ?? "";
    case "contactName": return account.contactName ?? "";
    case "accountName": return account.account ?? "";
    case "type": return account.type ?? "";
    case "location": return "location" in account ? account.location ?? "" : "";
    case "phone": return account.phone ?? "";
    case "email": return account.email ?? "";
    case "order": return "order" in account ? account.order ?? "" : "";
    default: return "";
  }
}

function applyAccountUpdates(account: AnyAccount, updates: UpdatePayload): AnyAccount {
  const next = { ...account } as AnyAccount;

  if (updates.newStatus !== undefined) next.status = updates.newStatus as AnyAccount["status"];
  if (updates.contactDate !== undefined) next.contactDate = formatDateForSheet(updates.contactDate);
  if (updates.nextSteps !== undefined) next.nextSteps = updates.nextSteps;
  if (updates.notes !== undefined) next.notes = updates.notes;
  if (updates.contactName !== undefined) next.contactName = updates.contactName;
  if (updates.accountName !== undefined) next.account = updates.accountName;
  if (updates.type !== undefined) next.type = updates.type;
  if (updates.location !== undefined && "location" in next) next.location = updates.location;
  if (updates.phone !== undefined) next.phone = updates.phone;
  if (updates.email !== undefined) next.email = updates.email;
  if (updates.order !== undefined && "order" in next) next.order = updates.order;

  return next;
}

async function syncUpdateToSheets(
  tab: string,
  rowIndex: number,
  updates: UpdatePayload
) {
  if (!canSyncSheets()) return;

  try {
    if (updates.newStatus !== undefined) {
      await updateCell(tab, rowIndex, getStatusColumnIndex(tab), updates.newStatus);
    }

    if (updates.contactDate !== undefined) {
      await updateCell(tab, rowIndex, getContactDateColumnIndex(tab), formatDateForSheet(updates.contactDate));
    }

    if (updates.nextSteps !== undefined) {
      await updateCell(tab, rowIndex, getNextStepsColumnIndex(tab), updates.nextSteps);
    }

    if (updates.notes !== undefined) {
      await updateCell(tab, rowIndex, getNotesColumnIndex(tab), updates.notes);
    }

    if (updates.contactName !== undefined) {
      await updateCell(tab, rowIndex, getContactNameColumnIndex(tab), updates.contactName);
    }

    if (updates.accountName !== undefined) {
      await updateCell(tab, rowIndex, getAccountColumnIndex(tab), updates.accountName);
    }

    if (updates.type !== undefined) {
      await updateCell(tab, rowIndex, getTypeColumnIndex(tab), updates.type);
    }

    if (updates.location !== undefined && tab !== "Active Accounts") {
      await updateCell(tab, rowIndex, getLocationColumnIndex(tab), updates.location);
    }

    if (updates.phone !== undefined) {
      await updateCell(tab, rowIndex, getPhoneColumnIndex(tab), updates.phone);
    }

    if (updates.email !== undefined) {
      await updateCell(tab, rowIndex, getEmailColumnIndex(tab), updates.email);
    }

    if (updates.order !== undefined && tab === "Active Accounts") {
      await updateCell(tab, rowIndex, getOrderColumnIndex(tab), updates.order);
    }
  } catch (error) {
    console.warn("Google Sheets secondary sync failed:", error);
  }
}

async function syncDeleteToSheets(tab: string, rowIndex: number) {
  if (!canSyncSheets()) return;

  try {
    await deleteRow(tab, rowIndex);
  } catch (error) {
    console.warn("Google Sheets secondary delete failed:", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tab,
      rowIndex,
      newStatus,
      contactDate,
      nextSteps,
      notes,
      contactName,
      accountName,
      type,
      location,
      phone,
      email,
      order,
      deleteRow: shouldDeleteRow,
      expectedValues,
    } = body;

    if (!tab || !rowIndex) {
      return NextResponse.json(
        { error: "tab and rowIndex are required" },
        { status: 400 }
      );
    }

    const { account, source } = await findAccountBySheetPosition(tab, rowIndex);

    if (expectedValues && typeof expectedValues === "object") {
      const currentValues: Record<string, string> = {};

      for (const [field, expectedValue] of Object.entries(expectedValues as Record<string, string>)) {
        if (account && source === "supabase") {
          currentValues[field] = getAccountFieldValue(account, field);
        } else {
          const columnIndex = getFieldColumnIndex(tab, field);
          currentValues[field] = await getCellValue(tab, rowIndex, columnIndex);
        }

        if (currentValues[field] !== (expectedValue ?? "")) {
          return NextResponse.json(
            {
              error: "Sheet row changed before this save completed",
              currentValues,
            },
            { status: 409 }
          );
        }
      }
    }

    if (shouldDeleteRow) {
      if (account) {
        await deleteAccountSnapshot(account.id);
      }
      await syncDeleteToSheets(tab, rowIndex);
      return NextResponse.json({ success: true });
    }

    const updates: UpdatePayload = {
      newStatus,
      contactDate,
      nextSteps,
      notes,
      contactName,
      accountName,
      type,
      location,
      phone,
      email,
      order,
    };

    if (account) {
      await upsertAccountSnapshot(toAccountSnapshot(applyAccountUpdates(account, updates)));
    }

    await syncUpdateToSheets(tab, rowIndex, updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account update error:", error);
    return NextResponse.json(
      { error: "Failed to update account" },
      { status: 500 }
    );
  }
}
