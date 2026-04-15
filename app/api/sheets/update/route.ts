import { NextRequest, NextResponse } from "next/server";
import { updateCell } from "@/lib/sheets/write";
import {
  getStatusColumnIndex,
  getContactDateColumnIndex,
  getNextStepsColumnIndex,
  getNotesColumnIndex,
} from "@/lib/sheets/schema";
import { formatDateForSheet } from "@/lib/utils/dates";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tab, rowIndex, newStatus, contactDate, nextSteps, notes } = body;

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sheet update error:", error);
    return NextResponse.json(
      { error: "Failed to update Google Sheet" },
      { status: 500 }
    );
  }
}
