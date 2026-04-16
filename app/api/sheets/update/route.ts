import { NextRequest, NextResponse } from "next/server";
import { deleteRow, getCellValue, updateCell } from "@/lib/sheets/write";
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

    if (expectedValues && typeof expectedValues === "object") {
      const currentValues: Record<string, string> = {};

      for (const [field, expectedValue] of Object.entries(expectedValues as Record<string, string>)) {
        const columnIndex = getFieldColumnIndex(tab, field);
        currentValues[field] = await getCellValue(tab, rowIndex, columnIndex);

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
      await deleteRow(tab, rowIndex);
      return NextResponse.json({ success: true });
    }

    // Update status if provided
    if (newStatus !== undefined) {
      const col = getStatusColumnIndex(tab);
      await updateCell(tab, rowIndex, col, newStatus);
    }

    // Update contact date if provided (format as M/DD for sheets)
    if (contactDate !== undefined) {
      const col = getContactDateColumnIndex(tab);
      const formattedDate = formatDateForSheet(contactDate);
      await updateCell(tab, rowIndex, col, formattedDate);
    }

    // Update next steps if provided
    if (nextSteps !== undefined) {
      const col = getNextStepsColumnIndex(tab);
      await updateCell(tab, rowIndex, col, nextSteps);
    }

    // Update notes if provided
    if (notes !== undefined) {
      const col = getNotesColumnIndex(tab);
      await updateCell(tab, rowIndex, col, notes);
    }

    // Update contact name if provided
    if (contactName !== undefined) {
      const col = getContactNameColumnIndex(tab);
      await updateCell(tab, rowIndex, col, contactName);
    }

    if (accountName !== undefined) {
      const col = getAccountColumnIndex(tab);
      await updateCell(tab, rowIndex, col, accountName);
    }

    if (type !== undefined) {
      const col = getTypeColumnIndex(tab);
      await updateCell(tab, rowIndex, col, type);
    }

    if (location !== undefined && tab !== "Active Accounts") {
      const col = getLocationColumnIndex(tab);
      await updateCell(tab, rowIndex, col, location);
    }

    if (phone !== undefined) {
      const col = getPhoneColumnIndex(tab);
      await updateCell(tab, rowIndex, col, phone);
    }

    if (email !== undefined) {
      const col = getEmailColumnIndex(tab);
      await updateCell(tab, rowIndex, col, email);
    }

    if (order !== undefined && tab === "Active Accounts") {
      const col = getOrderColumnIndex(tab);
      await updateCell(tab, rowIndex, col, order);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sheet update error:", error);
    return NextResponse.json(
      { error: "Failed to update Google Sheet" },
      { status: 500 }
    );
  }
}
