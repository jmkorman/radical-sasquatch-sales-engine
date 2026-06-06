import { NextRequest, NextResponse } from "next/server";
import {
  getAccountSnapshots,
  upsertAccountSnapshot,
  deleteAccountSnapshot,
} from "@/lib/supabase/queries";
import { buildStableAccountId } from "@/lib/accounts/identity";
import { createServerClient } from "@/lib/supabase/server";
import { TAB_NAME_TO_SLUG } from "@/lib/utils/constants";
import { TabName, TabSlug } from "@/types/accounts";
import { logError } from "@/lib/errors/log";

export const dynamic = "force-dynamic";

const ALLOWED_TABS: TabName[] = ["Restaurants", "Retail", "Catering", "Food Truck"];

/**
 * POST /api/accounts/retab
 * Body: { accountId: string, newTab: TabName }
 *
 * Moves an auto-inferred (row_index=0) account to a different pipeline tab.
 * Unlike /api/accounts/move this is Supabase-only — no sheet operations —
 * and works for accounts that exist only in Supabase (row_index=0).
 *
 * Steps:
 * 1. Load the source snapshot.
 * 2. Write a new snapshot under the new tab/id.
 * 3. Migrate activity_logs + orders to the new account_id.
 * 4. Delete the old snapshot.
 */
export async function POST(request: NextRequest) {
  try {
    const { accountId, newTab } = (await request.json()) as {
      accountId?: string;
      newTab?: string;
    };

    if (!accountId || !newTab || !ALLOWED_TABS.includes(newTab as TabName)) {
      return NextResponse.json(
        { error: "accountId and a valid newTab are required" },
        { status: 400 }
      );
    }

    const snapshots = await getAccountSnapshots();
    const snapshot = snapshots.find((s) => s.id === accountId);
    if (!snapshot) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const newTabName = newTab as TabName;
    const newTabSlug = TAB_NAME_TO_SLUG[newTabName] as TabSlug;
    const newId = buildStableAccountId(newTabSlug, snapshot.account_name || "");

    if (newId === accountId) {
      return NextResponse.json({ ok: true, newId, message: "Already in that tab" });
    }

    // Create the new snapshot under the correct tab.
    const newSnapshot = {
      ...snapshot,
      id: newId,
      tab: newTabName,
      tab_slug: newTabSlug,
      updated_at: new Date().toISOString(),
    };
    await upsertAccountSnapshot(newSnapshot);

    // Migrate children to new account_id.
    const supabase = createServerClient();
    const childUpdates = { account_id: newId, tab: newTabSlug };
    await supabase
      .from("activity_logs")
      .update(childUpdates)
      .eq("account_id", accountId)
      .then(() => undefined, (err) =>
        logError("accounts/retab/activity_logs", err, { fromId: accountId })
      );
    await supabase
      .from("orders")
      .update(childUpdates)
      .eq("account_id", accountId)
      .then(() => undefined, (err) =>
        logError("accounts/retab/orders", err, { fromId: accountId })
      );

    // Delete the old snapshot.
    await deleteAccountSnapshot(accountId).catch((err) =>
      logError("accounts/retab/delete", err, { accountId })
    );

    return NextResponse.json({ ok: true, newId });
  } catch (error) {
    await logError("accounts/retab", error);
    return NextResponse.json({ error: "Retab failed" }, { status: 500 });
  }
}
