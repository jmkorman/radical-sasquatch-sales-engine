"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnyAccount, TabName } from "@/types/accounts";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LogOutreachModal } from "@/components/features/dashboard/LogOutreachModal";
import { useSheetStore } from "@/stores/useSheetStore";
import { useUIStore } from "@/stores/useUIStore";
import { getAllPipelineAccounts } from "@/lib/pipeline/urgency";
import { persistActivityEntry } from "@/lib/activity/persist";
import { todayISO } from "@/lib/utils/dates";
import { STATUS_VALUES, TAB_NAME_TO_SLUG } from "@/lib/utils/constants";
import { normalizeAccountName, buildStableAccountId } from "@/lib/accounts/identity";
import { addToHitList } from "@/lib/dashboard/hitList";

type AddAccountForm = {
  tab: TabName;
  account: string;
  type: string;
  location: string;
  contactName: string;
  phone: string;
  email: string;
  website: string;
  ig: string;
  status: string;
  nextSteps: string;
  notes: string;
};

const EMPTY_ADD_ACCOUNT_FORM: AddAccountForm = {
  tab: "Restaurants",
  account: "",
  type: "",
  location: "",
  contactName: "",
  phone: "",
  email: "",
  website: "",
  ig: "",
  status: "Identified",
  nextSteps: "",
  notes: "",
};

export function QuickLogButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [addAccountMessage, setAddAccountMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AnyAccount | null>(null);
  const [accountSearch, setAccountSearch] = useState("");
  const [addForm, setAddForm] = useState<AddAccountForm>(EMPTY_ADD_ACCOUNT_FORM);
  const [addToHitListChecked, setAddToHitListChecked] = useState(false);

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

  const duplicateMatches = useMemo(() => {
    const normalized = normalizeAccountName(addForm.account);
    if (!normalized) return [];
    return allAccounts
      .filter((account) => normalizeAccountName(account.account) === normalized)
      .slice(0, 3);
  }, [addForm.account, allAccounts]);

  const handleOpen = () => {
    setOpen(true);
    setAddOpen(false);
    setSelectedAccount(null);
    setAccountSearch("");
    if (!data) fetchAllTabs();
  };

  const handleAddOpen = () => {
    setAddOpen(true);
    setOpen(false);
    setSelectedAccount(null);
    setAddForm(EMPTY_ADD_ACCOUNT_FORM);
    setAddAccountMessage(null);
    setAddToHitListChecked(false);
  };

  const handleClose = () => {
    setOpen(false);
    setAddOpen(false);
    setSelectedAccount(null);
  };

  const updateAddField = (field: keyof AddAccountForm, value: string) => {
    setAddForm((prev) => ({ ...prev, [field]: value }));
    if (addAccountMessage?.tone === "error") setAddAccountMessage(null);
  };

  const handleAddAccount = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!addForm.account.trim()) {
      setAddAccountMessage({ tone: "error", text: "Account name is required." });
      return;
    }

    setAddingAccount(true);
    setAddAccountMessage({ tone: "info", text: "Adding account..." });
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to add account.");
      }

      const created: { tab?: TabName; rowIndex?: number | null; href?: string } = await res.json();
      if (addToHitListChecked) {
        addToHitList(buildStableAccountId(addForm.tab, addForm.account));
      }
      await fetchAllTabs();
      setAddAccountMessage({ tone: "success", text: "Account added. Opening it now..." });
      setAddForm(EMPTY_ADD_ACCOUNT_FORM);
      showActionFeedback("Account added.", "success");
      setAddOpen(false);
      router.push(
        created.href ||
          (created.tab && created.rowIndex
            ? `/accounts/${TAB_NAME_TO_SLUG[created.tab]}/${created.rowIndex}`
            : "/pipeline")
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn’t add that account.";
      setAddAccountMessage({ tone: "error", text: message });
      showActionFeedback(message, "error");
    } finally {
      setAddingAccount(false);
    }
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
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 sm:flex-row">
        <button
          type="button"
          onClick={handleAddOpen}
          className="rounded-xl border border-rs-border/80 bg-[#1a0f45]/95 px-4 py-3 text-sm font-bold text-rs-cream shadow-[0_10px_28px_rgba(9,4,26,0.38)] backdrop-blur transition-all hover:border-rs-gold/70 hover:text-rs-gold"
        >
          Add Account
        </button>
        <button
          type="button"
          onClick={handleOpen}
          className="rounded-xl bg-rs-cyan px-4 py-3 text-sm font-black text-[#100726] shadow-[0_10px_28px_rgba(100,245,234,0.34)] transition-all hover:brightness-110"
        >
          Log Outreach
        </button>
      </div>

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

      {addOpen && (
        <Modal title="Add Account" onClose={handleClose}>
          <form className="space-y-4" onSubmit={handleAddAccount}>
            {addAccountMessage && (
              <div
                className={`rounded-xl border px-3 py-2 text-sm ${
                  addAccountMessage.tone === "error"
                    ? "border-rs-punch/50 bg-rs-punch/10 text-[#ffd6e8]"
                    : addAccountMessage.tone === "success"
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                      : "border-rs-border/70 bg-white/5 text-[#d8ccfb]"
                }`}
              >
                {addAccountMessage.text}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[#af9fe6]">Pipeline</span>
                <select
                  value={addForm.tab}
                  onChange={(e) => updateAddField("tab", e.target.value as TabName)}
                  className="w-full rounded-lg border border-[#3a2f6e] bg-[#100726] px-3 py-2 text-white outline-none focus:border-[#64f5ea]"
                >
                  {(["Restaurants", "Retail", "Catering", "Food Truck", "Active Accounts"] as TabName[]).map((tab) => (
                    <option key={tab} value={tab}>{tab}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[#af9fe6]">Status</span>
                <select
                  value={addForm.status}
                  onChange={(e) => updateAddField("status", e.target.value)}
                  className="w-full rounded-lg border border-[#3a2f6e] bg-[#100726] px-3 py-2 text-white outline-none focus:border-[#64f5ea]"
                >
                  {STATUS_VALUES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-1 text-sm">
              <span className="text-[#af9fe6]">Account *</span>
              <input
                autoFocus
                required
                value={addForm.account}
                onChange={(e) => updateAddField("account", e.target.value)}
                className="w-full rounded-lg border border-[#3a2f6e] bg-[#100726] px-3 py-2 text-white outline-none focus:border-[#64f5ea]"
              />
            </label>

            {duplicateMatches.length > 0 && (
              <div className="rounded-xl border border-rs-gold/35 bg-rs-gold/10 px-3 py-2 text-sm text-[#fff2c8]">
                <div className="font-semibold">Possible existing account</div>
                <div className="mt-1 space-y-1">
                  {duplicateMatches.map((account) => (
                    <button
                      key={`${account._tabSlug}_${account._rowIndex}_duplicate`}
                      type="button"
                      onClick={() => {
                        setAddOpen(false);
                        router.push(`/accounts/${account._tabSlug}/${account._rowIndex}`);
                      }}
                      className="block w-full truncate rounded-lg px-2 py-1 text-left text-xs text-[#ffe7a3] transition-colors hover:bg-white/10"
                    >
                      {account.account} · {account._tab}
                      {"location" in account && account.location ? ` · ${account.location}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Type" value={addForm.type} onChange={(value) => updateAddField("type", value)} />
              <TextField label="Location" value={addForm.location} onChange={(value) => updateAddField("location", value)} />
              <TextField label="Contact" value={addForm.contactName} onChange={(value) => updateAddField("contactName", value)} />
              <TextField label="Phone" value={addForm.phone} onChange={(value) => updateAddField("phone", value)} />
              <TextField label="Email" value={addForm.email} onChange={(value) => updateAddField("email", value)} />
              <TextField label="Website" value={addForm.website} onChange={(value) => updateAddField("website", value)} />
            </div>

            <TextField label="Instagram" value={addForm.ig} onChange={(value) => updateAddField("ig", value)} />

            <label className="space-y-1 text-sm">
              <span className="text-[#af9fe6]">Next Step</span>
              <textarea
                value={addForm.nextSteps}
                onChange={(e) => updateAddField("nextSteps", e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[#3a2f6e] bg-[#100726] px-3 py-2 text-white outline-none focus:border-[#64f5ea]"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[#af9fe6]">Notes</span>
              <textarea
                value={addForm.notes}
                onChange={(e) => updateAddField("notes", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[#3a2f6e] bg-[#100726] px-3 py-2 text-white outline-none focus:border-[#64f5ea]"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={addToHitListChecked}
                onChange={(e) => setAddToHitListChecked(e.target.checked)}
                className="rounded border-[#3a2f6e] bg-[#100726] accent-rs-cyan"
              />
              <span className="text-[#af9fe6]">Add to today's hit list</span>
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={addingAccount || !addForm.account.trim()}>
                {addingAccount ? "Adding..." : "Add Account"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-[#af9fe6]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#3a2f6e] bg-[#100726] px-3 py-2 text-white outline-none focus:border-[#64f5ea]"
      />
    </label>
  );
}
