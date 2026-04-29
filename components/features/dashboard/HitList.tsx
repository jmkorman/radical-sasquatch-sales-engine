"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { HitListItem } from "@/lib/dashboard/prioritizer";
import { LogOutreachModal } from "./LogOutreachModal";
import { AnyAccount } from "@/types/accounts";
import { useSheetStore } from "@/stores/useSheetStore";
import { daysSince, todayISO } from "@/lib/utils/dates";
import { useUIStore } from "@/stores/useUIStore";
import { persistActivityEntry } from "@/lib/activity/persist";
import { getAllAccounts } from "@/lib/activity/timeline";
import { getAccountPrimaryId } from "@/lib/accounts/identity";
import { clearHitListSuppression, loadHitListSets, setHitListPinned, suppressHitListAccount } from "@/lib/dashboard/hitList";

type DisplayHitListItem = {
  account: AnyAccount;
  reason: string;
  daysSinceLastTouch: number;
  lastActivityDate: string | null;
  manual?: boolean;
};

// items prop retained for API compatibility; accounts are now manually curated only
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function HitList({ items: _items }: { items: HitListItem[] }) {
  const [modalAccount, setModalAccount] = useState<AnyAccount | null>(null);
  const [query, setQuery] = useState("");
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => loadHitListSets().removedIds);
  const [savingHitListId, setSavingHitListId] = useState<string | null>(null);
  const { data, fetchAllTabs } = useSheetStore();
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);

  const allAccounts = useMemo(() => (data ? getAllAccounts(data) : []), [data]);

  // Only show manually added accounts — no algorithm auto-suggestions
  const visibleItems = useMemo<DisplayHitListItem[]>(() => {
    return allAccounts
      .filter((account) => account.hitListPinned)
      .filter((account) => !removedIds.has(getAccountPrimaryId(account)))
      .map((account) => ({
        account,
        reason: "On hit list",
        daysSinceLastTouch: daysSince(account.contactDate),
        lastActivityDate: null,
        manual: true,
      }));
  }, [allAccounts, removedIds]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const alreadyOnList = new Set(visibleItems.map((item) => getAccountPrimaryId(item.account)));
    return allAccounts
      .filter((account) => !account.hitListPinned && !alreadyOnList.has(getAccountPrimaryId(account)))
      .filter((account) =>
        [
          account.account,
          account.contactName,
          account.type,
          "location" in account ? account.location : "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 6);
  }, [allAccounts, query, visibleItems]);

  const addAccount = async (account: AnyAccount) => {
    const id = getAccountPrimaryId(account);
    setSavingHitListId(id);
    // Snapshot previous suppression state so we can restore it if the save fails
    const wasSuppressed = removedIds.has(id);
    clearHitListSuppression(id);
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    try {
      await setHitListPinned(id, true);
      await fetchAllTabs({ silent: true });
      setQuery("");
      showActionFeedback(`${account.account} added to the hit list.`, "success");
    } catch (error) {
      // Roll back local state so the UI matches reality
      if (wasSuppressed) {
        suppressHitListAccount(id);
        setRemovedIds((prev) => new Set(prev).add(id));
      }
      showActionFeedback(
        error instanceof Error ? error.message : "Couldn't save the hit list change.",
        "error"
      );
    } finally {
      setSavingHitListId(null);
    }
  };

  const removeAccount = async (account: AnyAccount) => {
    const id = getAccountPrimaryId(account);
    setSavingHitListId(id);
    suppressHitListAccount(id);
    setRemovedIds((prev) => new Set(prev).add(id));

    try {
      await setHitListPinned(id, false);
      await fetchAllTabs({ silent: true });
      showActionFeedback(`${account.account} removed from the hit list.`, "success");
    } catch (error) {
      clearHitListSuppression(id);
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showActionFeedback(
        error instanceof Error ? error.message : "Couldn't save the hit list change.",
        "error"
      );
    } finally {
      setSavingHitListId(null);
    }
  };

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

  return (
    <>
      <div className="space-y-3">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pipeline to add account..."
            className="w-full rounded-xl border border-rs-border/70 bg-black/20 px-3 py-2 text-sm text-rs-cream placeholder-[#8c7fbd] outline-none transition-colors focus:border-rs-cyan/70"
          />
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border border-rs-border/80 bg-[#100726] shadow-2xl">
              {searchResults.map((account) => (
                <button
                  key={`${account._tabSlug}_${account._rowIndex}_add`}
                  type="button"
                  onClick={() => void addAccount(account)}
                  disabled={savingHitListId === getAccountPrimaryId(account)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-white/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-rs-cream">{account.account}</span>
                    <span className="block truncate text-xs text-[#af9fe6]">
                      {account._tab} {"location" in account && account.location ? `- ${account.location}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg border border-rs-cyan/40 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-rs-cyan">
                    {savingHitListId === getAccountPrimaryId(account) ? "Saving" : "Add"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {visibleItems.length === 0 ? (
          <div className="rounded-xl border border-rs-border/60 bg-black/10 px-3 py-4 text-sm text-[#d8ccfb]">
            No accounts need attention today. Search above to add one manually.
          </div>
        ) : (
          <div className="grid gap-2">
            {visibleItems.map((item) => (
              <div
                key={`${item.account._tabSlug}_${item.account._rowIndex}_hit`}
                className="rounded-xl border border-rs-border/60 bg-black/10 px-3 py-2.5 transition-colors hover:border-rs-gold/40 hover:bg-white/5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`/accounts/${item.account._tabSlug}/${item.account._rowIndex}`}
                        className="truncate font-semibold text-rs-cream hover:text-rs-gold"
                      >
                        {item.account.account}
                      </Link>
                      <span className="shrink-0 rounded-full border border-rs-border/60 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#af9fe6]">
                        {item.account.status || "No status"}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-[#d8ccfb]">
                      {item.reason}
                      {Number.isFinite(item.daysSinceLastTouch) && item.daysSinceLastTouch >= 0
                        ? ` - ${item.daysSinceLastTouch}d since touch`
                        : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setModalAccount(item.account)}
                      className="rounded-lg border border-rs-cyan/40 bg-rs-cyan/10 px-2.5 py-1 text-[11px] font-semibold text-rs-cyan transition-colors hover:bg-rs-cyan/20"
                    >
                      Log
                    </button>
                    <button
                      type="button"
                      disabled={savingHitListId === getAccountPrimaryId(item.account)}
                      onClick={() => void removeAccount(item.account)}
                      className="rounded-lg border border-rs-border/60 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-[#af9fe6] transition-colors hover:border-rs-punch/40 hover:text-rs-punch"
                    >
                      {savingHitListId === getAccountPrimaryId(item.account) ? "Saving..." : "Remove"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
