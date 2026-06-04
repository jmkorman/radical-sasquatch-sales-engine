import { NextRequest, NextResponse } from "next/server";
import { getAccountSnapshots, updateAccountSnapshot, cascadeDeleteAccount } from "@/lib/supabase/queries";
import { isPendingReview } from "@/lib/accounts/snapshot";
import { normalizeAccountName } from "@/lib/accounts/identity";
import { logError } from "@/lib/errors/log";

export const dynamic = "force-dynamic";

export interface PendingReviewItem {
  id: string;
  account_name: string;
  tab: string;
  tab_slug: string;
  location: string | null;
  email: string | null;
  reason: string;
  confidence: number | null;
  created_at: string;
}

export async function GET() {
  try {
    const snapshots = await getAccountSnapshots();
    const pending: PendingReviewItem[] = snapshots
      .filter(isPendingReview)
      .map((s) => {
        const raw = (s.raw ?? {}) as Record<string, unknown>;
        return {
          id: s.id,
          account_name: s.account_name,
          tab: s.tab,
          tab_slug: s.tab_slug,
          location: s.location,
          email: s.email,
          reason: typeof raw.review_reason === "string" ? raw.review_reason : "",
          confidence: typeof raw.review_confidence === "number" ? raw.review_confidence : null,
          created_at: s.updated_at,
        };
      })
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

    return NextResponse.json({ pending });
  } catch (error) {
    await logError("accounts/review", error);
    return NextResponse.json({ error: "Failed to load review queue" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { id, action } = (await request.json()) as {
      id?: string;
      action?: "approve" | "reject";
    };

    if (!id || (action !== "approve" && action !== "reject")) {
      return NextResponse.json({ error: "id and a valid action are required" }, { status: 400 });
    }

    if (action === "reject") {
      await cascadeDeleteAccount(id);
      return NextResponse.json({ ok: true, action });
    }

    // Approve: strip the review flags so the account surfaces in the pipeline.
    const snapshots = await getAccountSnapshots();
    const snapshot = snapshots.find((s) => s.id === id);
    if (!snapshot) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const raw = { ...((snapshot.raw ?? {}) as Record<string, unknown>) };
    delete raw.review_pending;
    delete raw.review_reason;
    delete raw.review_confidence;

    // Delete any duplicate live (non-pending) auto-inferred account with the
    // same name but a different tab. These are created when the Gmail poll
    // re-infers an account that was already in the review queue.
    const normalizedName = normalizeAccountName(snapshot.account_name || "");
    if (normalizedName) {
      for (const s of snapshots) {
        if (s.id === id) continue;
        if (Number(s.row_index) !== 0) continue; // only auto-inferred accounts
        if (isPendingReview(s)) continue; // only live duplicates
        if (normalizeAccountName(s.account_name || "") !== normalizedName) continue;
        await cascadeDeleteAccount(s.id).catch(() => {});
      }
    }

    await updateAccountSnapshot(id, { raw });
    return NextResponse.json({ ok: true, action });
  } catch (error) {
    await logError("accounts/review", error);
    return NextResponse.json({ error: "Failed to update review queue" }, { status: 500 });
  }
}
