"use client";

import { useState } from "react";
import { HitListItem } from "@/lib/dashboard/prioritizer";
import { AccountCard } from "./AccountCard";
import { LogOutreachModal } from "./LogOutreachModal";
import { AnyAccount } from "@/types/accounts";
import { useSheetStore } from "@/stores/useSheetStore";
import { todayISO } from "@/lib/utils/dates";
import { useUIStore } from "@/stores/useUIStore";
import { persistActivityEntry } from "@/lib/activity/persist";

export function HitList({ items }: { items: HitListItem[] }) {
  const [modalAccount, setModalAccount] = useState<AnyAccount | null>(null);
  const { fetchAllTabs } = useSheetStore();
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);

  const handleSubmitOutreach = async (data: {
    actionType: string;
    statusAfter: string;
    note: string;
    followUpDate: string;
    nextActionType: string;
  }) => {
    if (!modalAccount) return;

    try {
      await persistActivityEntry({
        account: modalAccount,
        actionType: data.actionType,
        note: data.note,
        followUpDate: data.followUpDate || null,
        statusBefore: modalAccount.status,
        statusAfter: data.statusAfter,
        source: "manual",
        activityKind: "outreach",
        countsAsContact: true,
        nextActionType: data.nextActionType,
      });
    } catch {
      showActionFeedback("Couldn’t save that outreach entry to the online timeline.", "error");
      return;
    }

    const response = await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab: modalAccount._tab,
        rowIndex: modalAccount._rowIndex,
        newStatus: data.statusAfter,
        contactDate: todayISO(),
        nextSteps: data.note,
        expectedValues: {
          newStatus: modalAccount.status || "",
          nextSteps: modalAccount.nextSteps || "",
        },
      }),
    });

    if (response.status === 409) {
      await fetchAllTabs();
      showActionFeedback("The hit-list account changed before this save completed. I refreshed the latest sheet data.", "error");
      return;
    }

    if (!response.ok) {
      showActionFeedback("Outreach was logged, but the sheet update failed.", "error");
      return;
    }

    await fetchAllTabs();
    showActionFeedback("Outreach logged from the hit list.", "success");
    setModalAccount(null);
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
