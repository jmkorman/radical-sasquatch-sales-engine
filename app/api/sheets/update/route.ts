import { NextRequest, NextResponse } from "next/server";
import { updateCell } from "@/lib/sheets/write";
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
    } = body;

    if (!tab || !rowIndex) {
      return NextResponse.json(
        { error: "tab and rowIndex are required" },
        { status: 400 }
      );
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
