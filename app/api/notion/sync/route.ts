import { NextRequest, NextResponse } from "next/server";
import { getCompletedTasks } from "@/lib/notion/tasks";
import { getAppSetting, upsertAppSetting, insertActivityLog } from "@/lib/supabase/queries";

export async function POST(request: NextRequest) {
  // Validate cron secret for automated calls
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const lastSync = (await getAppSetting("last_notion_sync")) ?? new Date(0).toISOString();
    const completedTasks = await getCompletedTasks(lastSync);

    let synced = 0;
    for (const task of completedTasks) {
      // Extract account info from task title if possible
      const title = (task as any).properties?.Name?.title?.[0]?.plain_text ?? "";
      const accountName = title.replace("Follow up: ", "");

      await insertActivityLog({
        account_id: "notion_sync",
        tab: "notion",
        row_index: 0,
        account_name: accountName,
        action_type: "note",
        note: "Notion task marked complete",
        source: "notion_sync",
      });
      synced++;
    }

    await upsertAppSetting("last_notion_sync", new Date().toISOString());

    return NextResponse.json({ synced });
  } catch (error) {
    console.error("Notion sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
