"use client";

import { useState } from "react";
import { HitListItem } from "@/lib/dashboard/prioritizer";
import { AccountCard } from "./AccountCard";
import { LogOutreachModal } from "./LogOutreachModal";
import { AnyAccount } from "@/types/accounts";
import { useSheetStore } from "@/stores/useSheetStore";
import { useOutreachStore } from "@/stores/useOutreachStore";
import { todayISO } from "@/lib/utils/dates";

export function HitList({ items }: { items: HitListItem[] }) {
  const [modalAccount, setModalAccount] = useState<AnyAccount | null>(null);
  const { fetchAllTabs } = useSheetStore();
  const outreachStore = useOutreachStore();

  const handleSubmitOutreach = async (data: {
    actionType: string;
    statusAfter: string;
    note: string;
    followUpDate: string;
  }) => {
    if (!modalAccount) return;

    const accountId = `${modalAccount._tabSlug}_${modalAccount._rowIndex}`;

    // Save to localStorage immediately (no Supabase required)
    outreachStore.addEntry({
      account_id: accountId,
      account_name: modalAccount.account,
      tab: modalAccount._tabSlug,
      action_type: data.actionType,
      note: data.note,
      status_before: modalAccount.status,
      status_after: data.statusAfter,
      follow_up_date: data.followUpDate || null,
    });

    // Also try Supabase (non-blocking)
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId,
        tab: modalAccount._tabSlug,
        row_index: modalAccount._rowIndex,
        account_name: modalAccount.account,
        action_type: data.actionType,
        note: data.note,
        status_before: modalAccount.status,
        status_after: data.statusAfter,
        follow_up_date: data.followUpDate || null,
      }),
    }).catch(() => {});

    // Update sheet (status + contact date)
    await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab: modalAccount._tab,
        rowIndex: modalAccount._rowIndex,
        newStatus: data.statusAfter,
        contactDate: todayISO(),
        nextSteps: data.note,
      }),
    });

    // Create Notion task if follow-up date set
    if (data.followUpDate) {
      try {
        const notionRes = await fetch("/api/notion/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountName: modalAccount.account,
            contactName: "contactName" in modalAccount ? modalAccount.contactName : "",
            followUpDate: data.followUpDate,
            accountUrl: `${window.location.origin}/accounts/${modalAccount._tabSlug}/${modalAccount._rowIndex}`,
          }),
        });
        if (!notionRes.ok) {
          const errText = await notionRes.text();
          console.error("Notion task creation failed:", notionRes.status, errText);
        } else {
          console.log("Notion task created successfully");
        }
      } catch (err) {
        console.error("Notion task fetch error:", err);
      }
    }

    await fetchAllTabs();
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">No accounts need attention today</p>
        <p className="text-sm mt-1">Check the Pipeline tab to find new prospects</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3">
        {items.map((item) => (
          <AccountCard
            key={`${item.account._tabSlug}_${item.account._rowIndex}`}
            account={item.account}
            reason={item.reason}
            lastActivityDate={item.lastActivity?.created_at ?? null}
            onLogOutreach={() => setModalAccount(item.account)}
          />
        ))}
      </div>

      {modalAccount && (
        <LogOutreachModal
          account={modalAccount}
          onClose={() => setModalAccount(null)}
          onSubmit={handleSubmitOutreach}
        />
      )}
    </>
  );
}
