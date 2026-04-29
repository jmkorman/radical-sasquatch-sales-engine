import { NextRequest, NextResponse } from "next/server";
import { appendRow } from "@/lib/sheets/write";
import { accountsForTab, getAccountsData } from "@/lib/accounts/source";
import { buildStableAccountId, normalizeAccountName } from "@/lib/accounts/identity";
import { getAllAccounts, toAccountSnapshot } from "@/lib/accounts/snapshot";
import { upsertAccountSnapshot } from "@/lib/supabase/queries";
import { STATUS_VALUES, TAB_NAME_TO_SLUG } from "@/lib/utils/constants";
import { AnyAccount, StatusValue, TabName } from "@/types/accounts";

const ALLOWED_TABS: TabName[] = ["Restaurants", "Retail", "Catering", "Food Truck", "Active Accounts"];

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getStatus(value: unknown): StatusValue {
  const requested = clean(value) as StatusValue;
  return STATUS_VALUES.includes(requested) ? requested : "Identified";
}

function buildRow(tab: TabName, body: Record<string, unknown>): string[] {
  const account = clean(body.account);
  const type = clean(body.type);
  const location = clean(body.location);
  const website = clean(body.website);
  const ig = clean(body.ig);
  const status = getStatus(body.status);
  const nextSteps = clean(body.nextSteps);
  const contactName = clean(body.contactName);
  const phone = clean(body.phone);
  const email = clean(body.email);
  const estMonthlyOrder = clean(body.estMonthlyOrder);
  const commissionPct = clean(body.commissionPct);
  const notes = clean(body.notes);

  switch (tab) {
    case "Restaurants":
      return [
        account,
        type,
        location,
        ig,
        website,
        clean(body.kitchen),
        clean(body.dumplings),
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
      return [
        account,
        type,
        location,
        ig,
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
      ];
    case "Catering":
      return [
        account,
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
      ];
    case "Food Truck":
      return [
        account,
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
        account,
        type,
        contactName,
        status,
        clean(body.rsLead),
        "",
        nextSteps,
        phone,
        email,
        clean(body.order),
        notes,
      ];
  }
}

function parseRowIndex(updatedRange: string | null): number | null {
  if (!updatedRange) return null;
  const match = updatedRange.match(/![A-Z]+(\d+):/);
  return match ? Number(match[1]) : null;
}

function canSyncSheets() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.GOOGLE_SHEET_ID);
}

function nextRowIndex(accounts: AnyAccount[]): number {
  return Math.max(1, ...accounts.map((account) => account._rowIndex || 1)) + 1;
}

function buildAccount(tab: TabName, body: Record<string, unknown>, rowIndex: number): AnyAccount {
  const tabSlug = TAB_NAME_TO_SLUG[tab];
  const account = clean(body.account);
  const common = {
    id: buildStableAccountId(tabSlug, account),
    _rowIndex: rowIndex,
    _tab: tab,
    _tabSlug: tabSlug,
    account,
    type: clean(body.type),
    status: getStatus(body.status),
    nextSteps: clean(body.nextSteps),
    nextActionType: clean(body.nextActionType),
    contactDate: "",
    contactName: clean(body.contactName),
    phone: clean(body.phone),
    email: clean(body.email),
    notes: clean(body.notes),
  };

  if (tab === "Active Accounts") {
    return {
      ...common,
      _tab: "Active Accounts",
      _tabSlug: "active-accounts",
      rsLead: clean(body.rsLead),
      order: clean(body.order),
    };
  }

  const prospectCommon = {
    ...common,
    location: clean(body.location),
    estMonthlyOrder: clean(body.estMonthlyOrder),
    commissionPct: clean(body.commissionPct),
    ig: clean(body.ig),
    website: clean(body.website),
  };

  if (tab === "Restaurants") {
    return {
      ...prospectCommon,
      _tab: "Restaurants",
      _tabSlug: "restaurants",
      kitchen: clean(body.kitchen),
      dumplings: clean(body.dumplings),
    };
  }

  if (tab === "Retail") {
    return {
      ...prospectCommon,
      _tab: "Retail",
      _tabSlug: "retail",
    };
  }

  if (tab === "Catering") {
    return {
      ...prospectCommon,
      _tab: "Catering",
      _tabSlug: "catering",
    };
  }

  return {
    ...prospectCommon,
    _tab: "Food Truck",
    _tabSlug: "food-truck",
  };
}

async function syncNewAccountToSheets(tab: TabName, body: Record<string, unknown>) {
  if (!canSyncSheets()) return null;

  try {
    return parseRowIndex(await appendRow(tab, buildRow(tab, body)));
  } catch (error) {
    console.warn("Google Sheets secondary account append failed:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tab = clean(body.tab) as TabName;

    if (!ALLOWED_TABS.includes(tab)) {
      return NextResponse.json({ error: "Choose a valid account tab." }, { status: 400 });
    }

    if (!clean(body.account)) {
      return NextResponse.json({ error: "Account name is required." }, { status: 400 });
    }

    const { data } = await getAccountsData();
    const tabAccounts = accountsForTab(data, tab);
    const requestedAccountName = clean(body.account);
    const requestedNorm = normalizeAccountName(requestedAccountName);
    const duplicate = getAllAccounts(data).find(
      (existing) => normalizeAccountName(existing.account) === requestedNorm
    );

    if (duplicate) {
      const sameTab = duplicate._tab === tab;
      return NextResponse.json(
        {
          error: sameTab
            ? `${duplicate.account} already exists in ${tab}.`
            : `${duplicate.account} already exists in ${duplicate._tab}. Move it from there instead of adding a duplicate.`,
          duplicate: {
            account: duplicate.account,
            tab: duplicate._tab,
            rowIndex: duplicate._rowIndex,
            href: `/accounts/${duplicate._tabSlug}/${duplicate._rowIndex}`,
          },
        },
        { status: 409 }
      );
    }

    const provisionalRowIndex = nextRowIndex(tabAccounts);
    let account = buildAccount(tab, body, provisionalRowIndex);
    const savedToSupabase = await upsertAccountSnapshot(toAccountSnapshot(account));

    if (!savedToSupabase) {
      const sheetRowIndex = await syncNewAccountToSheets(tab, body);
      if (sheetRowIndex) {
        account = buildAccount(tab, body, sheetRowIndex);
      }
    } else {
      const sheetRowIndex = await syncNewAccountToSheets(tab, body);
      if (sheetRowIndex && sheetRowIndex !== account._rowIndex) {
        account = buildAccount(tab, body, sheetRowIndex);
        await upsertAccountSnapshot(toAccountSnapshot(account));
      }
    }

    const rowIndex = account._rowIndex || null;
    return NextResponse.json(
      {
        success: true,
        source: savedToSupabase ? "supabase" : "sheets",
        tab,
        rowIndex,
        href: rowIndex ? `/accounts/${TAB_NAME_TO_SLUG[tab]}/${rowIndex}` : "/pipeline",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Add account error:", error);
    return NextResponse.json({ error: "Failed to add account." }, { status: 500 });
  }
}
