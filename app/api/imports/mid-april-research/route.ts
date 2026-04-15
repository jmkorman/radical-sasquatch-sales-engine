import { NextResponse } from "next/server";
import { getAllTabs } from "@/lib/sheets/read";
import { updateCells } from "@/lib/sheets/write";
import {
  getContactNameColumnIndex,
  getEmailColumnIndex,
  getNotesColumnIndex,
  getNextStepsColumnIndex,
  getPhoneColumnIndex,
} from "@/lib/sheets/schema";
import { MID_APRIL_RESEARCH, MID_APRIL_RESEARCH_DATE } from "@/lib/imports/midAprilResearch";
import { AnyAccount } from "@/types/accounts";
import { deleteResearchImportLogs, insertActivityLog } from "@/lib/supabase/queries";
import { formatActivityNote } from "@/lib/activity/notes";

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildResearchLogNote(accountName: string, payload: typeof MID_APRIL_RESEARCH[number]) {
  return formatActivityNote({
    summary: `Imported research brief for ${accountName} (Apr 15, 2026)`,
    details: [
      `PITCH ANGLE: ${payload.pitchAngle}`,
      `CONTACTS:\n${payload.contacts.map((contact) => `- ${contact}`).join("\n")}`,
      `PLAN:\n${payload.plan.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
      `NOTES:\n${payload.notes.map((note) => `- ${note}`).join("\n")}`,
    ].join("\n\n"),
    nextStep: payload.plan[0] || "",
  });
}

function matchAccount(accounts: AnyAccount[], targetName: string) {
  const candidates = accounts.filter((account) => account.account.trim().length > 0);

  const exact = candidates.find((account) => account.account.trim().toLowerCase() === targetName.trim().toLowerCase());
  if (exact) return exact;

  const normalizedTarget = normalizeName(targetName);
  return candidates.find((account) => {
    const normalizedAccount = normalizeName(account.account);
    return (
      normalizedAccount === normalizedTarget ||
      normalizedAccount.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedAccount)
    );
  });
}

export async function POST() {
  try {
    await deleteResearchImportLogs(MID_APRIL_RESEARCH_DATE);

    const data = await getAllTabs();
    const accounts: AnyAccount[] = [
      ...data.restaurants,
      ...data.retail,
      ...data.catering,
      ...data.foodTruck,
      ...data.activeAccounts,
    ];

    const matched: string[] = [];
    const unmatched: string[] = [];

    for (const payload of MID_APRIL_RESEARCH) {
      const account = matchAccount(accounts, payload.accountName);

      if (!account) {
        unmatched.push(payload.accountName);
        continue;
      }

      const importedNotesBlock = [
        "IMPORTED MID-APRIL RESEARCH",
        `Pitch Angle: ${payload.pitchAngle}`,
        `Contacts: ${payload.contacts.join(" | ")}`,
        `Plan: ${payload.plan.join(" | ")}`,
        `Notes: ${payload.notes.join(" | ")}`,
      ].join("\n");

      const mergedNotes = account.notes?.includes("IMPORTED MID-APRIL RESEARCH")
        ? account.notes
        : [account.notes?.trim(), importedNotesBlock].filter(Boolean).join("\n\n");

      const researchNextStep = `Research next: ${payload.plan[0]}`;
      const nextSteps = account.nextSteps?.includes(researchNextStep)
        ? account.nextSteps
        : account.nextSteps?.trim()
          ? `${account.nextSteps} | ${researchNextStep}`
          : researchNextStep;
      const nextContactName = payload.primaryContactName || account.contactName || "";
      const nextEmail = payload.primaryEmail || account.email || "";
      const nextPhone = payload.primaryPhone || account.phone || "";

      const needsSheetUpdate =
        account.contactName !== nextContactName ||
        account.email !== nextEmail ||
        account.phone !== nextPhone ||
        account.nextSteps !== nextSteps ||
        account.notes !== mergedNotes;

      if (needsSheetUpdate) {
        await updateCells(account._tab, account._rowIndex, [
          {
            columnIndex: getContactNameColumnIndex(account._tab),
            value: nextContactName,
          },
          {
            columnIndex: getEmailColumnIndex(account._tab),
            value: nextEmail,
          },
          {
            columnIndex: getPhoneColumnIndex(account._tab),
            value: nextPhone,
          },
          {
            columnIndex: getNextStepsColumnIndex(account._tab),
            value: nextSteps,
          },
          {
            columnIndex: getNotesColumnIndex(account._tab),
            value: mergedNotes,
          },
        ]);
      }

      await insertActivityLog({
        account_id: `${account._tabSlug}_${account._rowIndex}`,
        tab: account._tabSlug,
        row_index: account._rowIndex,
        account_name: account.account,
        action_type: "note",
        note: buildResearchLogNote(account.account, payload),
        status_before: account.status || null,
        status_after: account.status || null,
        follow_up_date: null,
        source: "research",
        activity_kind: "research",
        counts_as_contact: false,
        created_at: MID_APRIL_RESEARCH_DATE,
      });

      matched.push(account.account);
    }

    return NextResponse.json({
      success: true,
      matched,
      unmatched,
    });
  } catch (error) {
    console.error("Mid-April research import error:", error);
    return NextResponse.json(
      { error: "Failed to import mid-April research" },
      { status: 500 }
    );
  }
}
