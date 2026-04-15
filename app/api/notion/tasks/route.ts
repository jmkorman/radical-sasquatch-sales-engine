import { NextRequest, NextResponse } from "next/server";
import { createTask } from "@/lib/notion/tasks";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountName, contactName, followUpDate, accountUrl } = body;

    if (!accountName || !followUpDate) {
      return NextResponse.json(
        { error: "accountName and followUpDate are required" },
        { status: 400 }
      );
    }

    const taskId = await createTask({
      accountName,
      contactName: contactName || "",
      followUpDate,
      accountUrl: accountUrl || "",
    });

    return NextResponse.json({ taskId }, { status: 201 });
  } catch (error) {
    console.error("Notion task creation error:", error);
    return NextResponse.json(
      { error: "Failed to create Notion task" },
      { status: 500 }
    );
  }
}
