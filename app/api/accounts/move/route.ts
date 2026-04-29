import { NextRequest, NextResponse } from "next/server";
import { appendRow, deleteRow } from "@/lib/sheets/write";
import { getAccountsData, accountsForTab } from "@/lib/accounts/source";
import {
  buildStableAccountId,
  normalizeAccountName,
} from "@/lib/accounts/identity";
import { toAccountSnapshot } from "@/lib/accounts/snapshot";
import {
  deleteAccountSnapshot,
  upsertAccountSnapshot,
} from "@/lib/supabase/queries";
import { createServerClient } from "@/lib/supabase/server";
import { TAB_NAME_TO_SLUG, TAB_SLUG_MAP } from "@/lib/utils/constants";
import { AnyAccount, TabName, TabSlug } from "@/types/accounts";
import { logError } from "@/lib/errors/log";

function canSyncSheets() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.GOOGLE_SHEET_ID);
}

const ALLOWED_TARGETS: TabName[] = [
  "Restaurants",
  "Retail",
  "Catering",
  "Food Truck",
  "Active Accounts",
];

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Accept either a TabName ("Restaurants") or TabSlug ("restaurants") and
 * return the canonical TabName. Returns null if the input doesn't match.
 */
function toTabName(value: string): TabName | null {
  if ((ALLOWED_TARGETS as readonly string[]).includes(value)) return value as TabName;
  if (value in TAB_SLUG_MAP) return TAB_SLUG_MAP[value as TabSlug];
  return null;
}

/**
 * Build the row layout matching api/accounts POST so the moved row lands
 * with the same column order. Active Accounts has a different schema than
 * the prospect tabs (no Instagram, no website, etc).
 */
function buildRow(tab: TabName, account: AnyAccount): string[] {
  const accountName = account.account ?? "";
  const type = account.type ?? "";
  const status = account.status ?? "";
  const nextSteps = account.nextSteps ?? "";
  const contactName = account.contactName ?? "";
  const phone = account.phone ?? "";
  const email = account.email ?? "";
  const notes = account.notes ?? "";
  const location = "location" in account ? account.location ?? "" : "";
  const website = "website" in account ? account.website ?? "" : "";
  const ig = "ig" in account ? account.ig ?? "" : "";
  const estMonthlyOrder = "estMonthlyOrder" in account ? account.estMonthlyOrder ?? "" : "";
  const commissionPct = "commissionPct" in account ? account.commissionPct ?? "" : "";

  switch (tab) {
    case "Restaurants":
      return [
        accountName,
        type,
        location,
        ig,
        website,
        "kitchen" in account ? account.kitchen ?? "" : "",
        "dumplings" in account ? account.dumplings ?? "" : "",
        status,
        nextSteps,
        "",
        contactName,
        phone,
        email,
        estMonthlyOrder,
        commissionPct,
        notes,
      ];
    case "Retail":
    case "Catering":
    case "Food Truck":
      return [
        accountName,
        type,
        location,
        website,
        status,
        nextSteps,
        "",
        contactName,
        phone,
        email,
        estMonthlyOrder,
        commissionPct,
        notes,
        ig,
        "",
      ];
    case "Active Accounts":
      return [
        accountName,
        type,
        contactName,
        status,
        "rsLead" in account ? account.rsLead ?? "" : "",
        "",
        nextSteps,
        phone,
        email,
        "order" in account ? account.order ?? "" : "",
        notes,
      ];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sourceTab = toTabName(clean(body.sourceTab));
    const targetTab = toTabName(clean(body.targetTab));
    const sourceRowIndex = Number(body.sourceRowIndex);

    if (!targetTab || !ALLOWED_TARGETS.includes(targetTab)) {
      return NextResponse.json({ error: "Invalid target tab" }, { status: 400 });
    }
    if (!sourceTab || !sourceRowIndex) {
      return NextResponse.json({ error: "sourceTab and sourceRowIndex required" }, { status: 400 });
    }
    if (sourceTab === targetTab) {
      return NextResponse.json({ error: "Source and target are the same" }, { status: 400 });
    }

    const { data } = await getAccountsData();
    const sourceAccounts = accountsForTab(data, sourceTab);
    const account = sourceAccounts.find((a) => a._rowIndex === sourceRowIndex);
    if (!account) {
      return NextResponse.json({ error: "Source account not found" }, { status: 404 });
    }

    // Block move if target tab already has an account with the same name
    const targetAccounts = accountsForTab(data, targetTab);
    const dup = targetAccounts.find(
      (existing) => normalizeAccountName(existing.account) === normalizeAccountName(account.account)
    );
    if (dup) {
      return NextResponse.json(
        {
          error: `${dup.account} already exists in ${targetTab}.`,
          duplicate: { tab: dup._tab, rowIndex: dup._rowIndex },
        },
        { status: 409 }
      );
    }

    // 1) Append the row to the target sheet
    const targetTabSlug = TAB_NAME_TO_SLUG[targetTab] as TabSlug;
    const newRowResp = await appendRow(targetTab, buildRow(targetTab, account));
    const newRowIndex = (() => {
      if (!newRowResp) return null;
      const match = newRowResp.match(/![A-Z]+(\d+):/);
      return match ? Number(match[1]) : null;
    })();

    if (newRowIndex == null || !Number.isFinite(newRowIndex)) {
      // Without a real new row index we can't safely point Supabase children
      // at the right row. Fail loudly instead of silently using the stale
      // source row index, which could collide with another account.
      await logError("accounts/move/append", new Error("missing newRowIndex"), {
        targetTab,
        appendResponse: newRowResp ?? null,
      });
      return NextResponse.json({ error: "Move failed: could not resolve new row" }, { status: 500 });
    }

    // 2) Update Supabase: delete old snapshot, insert new one with the new tab/row
    await deleteAccountSnapshot(account.id).catch(() => {});

    const movedAccount: AnyAccount = {
      ...account,
      _tab: targetTab,
      _tabSlug: targetTabSlug,
      _rowIndex: newRowIndex,
      id: buildStableAccountId(targetTabSlug, account.account),
    } as AnyAccount;

    await upsertAccountSnapshot(toAccountSnapshot(movedAccount));

    // 3) Migrate orders + activity_logs to point at the new account.
    // The account_id changes when an account moves between tabs because
    // buildStableAccountId hashes the slug. Without this step, every order
    // and log gets orphaned (still in the DB but pointing at a deleted snapshot).
    const supabase = createServerClient();
    const childUpdates = {
      account_id: movedAccount.id,
      tab: targetTabSlug,
      row_index: movedAccount._rowIndex,
    };
    await supabase
      .from("orders")
      .update(childUpdates)
      .eq("account_id", account.id)
      .then(() => undefined, (err) => logError("accounts/move/orders", err, { fromId: account.id }));
    await supabase
      .from("activity_logs")
      .update(childUpdates)
      .eq("account_id", account.id)
      .then(() => undefined, (err) => logError("accounts/move/activity_logs", err, { fromId: account.id }));

    // 4) Delete the old sheet row (best-effort — Supabase is the source of truth)
    if (canSyncSheets()) {
      try {
        await deleteRow(sourceTab, sourceRowIndex);
      } catch (err) {
        await logError("accounts/move/delete-old-row", err, { sourceTab, sourceRowIndex });
      }
    }

    return NextResponse.json({
      success: true,
      newTabSlug: targetTabSlug,
      newRowIndex: movedAccount._rowIndex,
      newId: movedAccount.id,
    });
  } catch (error) {
    await logError("accounts/move", error);
    return NextResponse.json({ error: "Move failed" }, { status: 500 });
  }
}
