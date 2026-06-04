import { NextResponse } from "next/server";
import { getAccountSnapshots, cascadeDeleteAccount } from "@/lib/supabase/queries";
import { isPendingReview } from "@/lib/accounts/snapshot";
import { normalizeAccountName } from "@/lib/accounts/identity";
import { logError } from "@/lib/errors/log";

export const dynamic = "force-dynamic";

/**
 * POST /api/accounts/cleanup-dupes
 *
 * One-time cleanup: finds auto-inferred (row_index=0) live accounts that share
 * a normalized name with another auto-inferred account in a different tab, and
 * deletes all but the most recently updated copy per name.
 *
 * This repairs the state left by the Gmail-poll re-inference bug where pending-
 * review accounts were invisible to the dupe check and got re-inferred with a
 * different tab classification.
 */
export async function POST() {
  try {
    const snapshots = await getAccountSnapshots();

    // Collect only live (non-pending) auto-inferred accounts keyed by name.
    const byName = new Map<string, typeof snapshots[number][]>();
    for (const s of snapshots) {
      if (isPendingReview(s)) continue;
      if (Number(s.row_index) !== 0) continue;
      const name = normalizeAccountName(s.account_name || "");
      if (!name) continue;
      const group = byName.get(name) ?? [];
      group.push(s);
      byName.set(name, group);
    }

    const toDelete: string[] = [];
    for (const group of Array.from(byName.values())) {
      if (group.length <= 1) continue;
      // Keep the most recently updated snapshot; delete the rest.
      group.sort((a, b) =>
        (Date.parse(b.updated_at || "") || 0) - (Date.parse(a.updated_at || "") || 0)
      );
      for (const s of group.slice(1)) {
        toDelete.push(s.id);
      }
    }

    for (const id of toDelete) {
      await cascadeDeleteAccount(id).catch(() => {});
    }

    return NextResponse.json({ ok: true, deleted: toDelete.length, ids: toDelete });
  } catch (error) {
    await logError("accounts/cleanup-dupes", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
