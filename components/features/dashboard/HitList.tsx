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
  }) => {
    if (!modalAccount) return;

    const { persistedRemotely } = await persistActivityEntry({
      account: modalAccount,
      actionType: data.actionType,
      note: data.note,
      followUpDate: data.followUpDate || null,
      statusBefore: modalAccount.status,
      statusAfter: data.statusAfter,
      source: "manual",
      activityKind: "outreach",
      countsAsContact: true,
    });

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
      showActionFeedback(
        persistedRemotely
          ? "Outreach saved, but the sheet update failed."
          : "Saved locally, but the sheet update failed.",
        "error"
      );
      return;
    }

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
    showActionFeedback(
      persistedRemotely
        ? "Outreach logged from the hit list."
        : "Outreach logged locally from the hit list. Cloud sync can retry later.",
      persistedRemotely ? "success" : "info"
    );
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
