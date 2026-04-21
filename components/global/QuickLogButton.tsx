"use client";

import { useState, useMemo } from "react";
import { AnyAccount } from "@/types/accounts";
import { Modal } from "@/components/ui/Modal";
import { LogOutreachModal } from "@/components/features/dashboard/LogOutreachModal";
import { useSheetStore } from "@/stores/useSheetStore";
import { useUIStore } from "@/stores/useUIStore";
import { getAllPipelineAccounts } from "@/lib/pipeline/urgency";
import { persistActivityEntry } from "@/lib/activity/persist";
import { todayISO } from "@/lib/utils/dates";

export function QuickLogButton() {
  const [open, setOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AnyAccount | null>(null);
  const [accountSearch, setAccountSearch] = useState("");

  const { data, fetchAllTabs } = useSheetStore();
  const showActionFeedback = useUIStore((s) => s.showActionFeedback);

  const allAccounts = useMemo(() => (data ? getAllPipelineAccounts(data) : []), [data]);

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.toLowerCase();
    const list = q
      ? allAccounts.filter(
          (a) =>
            a.account.toLowerCase().includes(q) ||
            (a.contactName || "").toLowerCase().includes(q) ||
            ("location" in a ? (a.location as string) : "").toLowerCase().includes(q)
        )
      : allAccounts;
    return list.slice(0, 30);
  }, [allAccounts, accountSearch]);

  const handleOpen = () => {
    setOpen(true);
    setSelectedAccount(null);
    setAccountSearch("");
    if (!data) fetchAllTabs();
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedAccount(null);
  };

  const handleSubmit = async (outreachData: {
    actionType: string;
    statusAfter: string;
    note: string;
    followUpDate: string;
    nextActionType: string;
  }) => {
    if (!selectedAccount) return;

    await persistActivityEntry({
      account: selectedAccount,
      actionType: outreachData.actionType,
      note: outreachData.note,
      followUpDate: outreachData.followUpDate || null,
      statusBefore: selectedAccount.status,
      statusAfter: outreachData.statusAfter,
      source: "manual",
      activityKind: "outreach",
      countsAsContact: true,
      nextActionType: outreachData.nextActionType,
    });

    await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab: selectedAccount._tab,
        rowIndex: selectedAccount._rowIndex,
        newStatus: outreachData.statusAfter,
        contactDate: todayISO(),
        nextSteps: outreachData.note,
      }),
    });

    await fetchAllTabs();
    handleClose();
    showActionFeedback("Outreach logged.", "success");
  };

  return (
    <>
      {/* Floating action button — always visible */}
      <button
        onClick={handleOpen}
        title="Quick Log"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 40,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "#64f5ea",
          color: "#100726",
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1,
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(100,245,234,0.4)",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        }}
      >
        +
      </button>

      {/* Account picker modal */}
      {open && !selectedAccount && (
        <Modal title="Quick Log — Pick an Account" onClose={handleClose}>
          <div className="flex flex-col gap-3">
            <input
              autoFocus
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              placeholder="Search account, contact, location…"
              className="w-full rounded-lg border border-[#3a2f6e] bg-[#100726] px-3 py-2 text-white text-sm placeholder-[#6b5fa0] focus:outline-none focus:border-[#64f5ea]"
            />
            {!data && (
              <p className="text-sm text-[#9d8dd5] px-1">Loading accounts…</p>
            )}
            <div
              className="flex flex-col gap-0.5 overflow-y-auto pr-1"
              style={{ maxHeight: 320 }}
            >
              {filteredAccounts.map((a) => (
                <button
                  key={`${a._tabSlug}_${a._rowIndex}`}
                  onClick={() => setSelectedAccount(a)}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[#1a0f45]"
                >
                  <span>
                    <span className="font-medium text-white">{a.account}</span>
                    {"location" in a && (a.location as string) && (
                      <span className="ml-2 text-xs text-[#9d8dd5]">
                        {a.location as string}
                      </span>
                    )}
                  </span>
                  {a.status && (
                    <span
                      className="ml-3 shrink-0 rounded px-1.5 py-0.5 text-xs"
                      style={{ background: "#1a0f45", color: "#9d8dd5", border: "1px solid #3a2f6e" }}
                    >
                      {a.status}
                    </span>
                  )}
                </button>
              ))}
              {filteredAccounts.length === 0 && accountSearch && (
                <p className="px-3 py-4 text-sm text-[#9d8dd5]">No accounts found</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Log form modal — after account is selected */}
      {open && selectedAccount && (
        <LogOutreachModal
          account={selectedAccount}
          onClose={handleClose}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
