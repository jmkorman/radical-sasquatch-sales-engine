import { NextRequest, NextResponse } from "next/server";
import { getAccountsData } from "@/lib/accounts/source";
import { getAllAccounts, toAccountSnapshot } from "@/lib/accounts/snapshot";
import { getAccountPrimaryId } from "@/lib/accounts/identity";
import { upsertAccountSnapshot } from "@/lib/supabase/queries";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    const hitListPinned = Boolean(body.hitListPinned);

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const { data } = await getAccountsData();
    const account = getAllAccounts(data).find(
      (candidate) => candidate.id === accountId || getAccountPrimaryId(candidate) === accountId
    );

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const saved = await upsertAccountSnapshot(
      toAccountSnapshot({
        ...account,
        hitListPinned,
      })
    );

    if (!saved) {
      return NextResponse.json({ error: "Account persistence is not configured" }, { status: 503 });
    }

    return NextResponse.json({ success: true, accountId, hitListPinned });
  } catch (error) {
    console.error("Hit list update error:", error);
    return NextResponse.json({ error: "Failed to save hit list state" }, { status: 500 });
  }
}
