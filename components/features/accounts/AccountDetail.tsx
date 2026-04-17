"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnyAccount } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { OrderRecord } from "@/types/orders";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { PitchReminder } from "./PitchReminder";
import { ActivityLogList } from "./ActivityLog";
import { QuickActions } from "./QuickActions";
import { LogOutreachModal } from "@/components/features/dashboard/LogOutreachModal";
import { todayISO, formatDate, formatDateShort } from "@/lib/utils/dates";
import { formatActivityNote } from "@/lib/activity/notes";
import { useOutreachStore } from "@/stores/useOutreachStore";
import { useTrashStore } from "@/stores/useTrashStore";
import { countsAsContact } from "@/lib/activity/helpers";
import { STATUS_VALUES } from "@/lib/utils/constants";
import { Select } from "@/components/ui/Select";
import { ContactManager } from "./ContactManager";
import { PlaybookPanel } from "./PlaybookPanel";
import { getOrderStats } from "@/lib/orders/helpers";
import { useSheetStore } from "@/stores/useSheetStore";
import { useUIStore } from "@/stores/useUIStore";
import { outreachEntriesToActivityLogs, mergeActivityLogs } from "@/lib/activity/local";
import { getLogsForAccount, getScheduledFollowUpLogForAccount } from "@/lib/activity/timeline";
import { getAccountPrimaryId } from "@/lib/accounts/identity";
import { persistActivityEntry } from "@/lib/activity/persist";
import { getAccountHealth } from "@/lib/accounts/health";

interface AccountDetailProps {
  account: AnyAccount;
  logs: ActivityLog[];
}

export function AccountDetail({ account, logs }: AccountDetailProps) {
  const outreachStore = useOutreachStore();
  const deletedLogs = useTrashStore((state) => state.deletedLogs);
  const { fetchAllTabs } = useSheetStore();
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);
  const showActionFeedbackWithAction = useUIStore((state) => state.showActionFeedbackWithAction);
  const accountId = getAccountPrimaryId(account);

  const [showLogModal, setShowLogModal] = useState(false);
  const [detailDraft, setDetailDraft] = useState({
    accountName: account.account,
    contactName: "contactName" in account ? account.contactName : "",
    type: account.type || "",
    location: "location" in account ? account.location || "" : "",
    phone: account.phone || "",
    email: account.email || "",
    order: "order" in account ? account.order || "" : "",
  });
  const [savedDetailDraft, setSavedDetailDraft] = useState({
    accountName: account.account,
    contactName: "contactName" in account ? account.contactName : "",
    type: account.type || "",
    location: "location" in account ? account.location || "" : "",
    phone: account.phone || "",
    email: account.email || "",
    order: "order" in account ? account.order || "" : "",
  });
  const [savedNotes, setSavedNotes] = useState(account.notes);
  const [savedNextSteps, setSavedNextSteps] = useState(account.nextSteps);
  const [notes, setNotes] = useState(account.notes);
  const [nextSteps, setNextSteps] = useState(account.nextSteps);
  const [currentStatus, setCurrentStatus] = useState<string>(account.status);
  const [activityOverrides, setActivityOverrides] = useState<Record<string, Partial<ActivityLog>>>({});
  const [serverJournalLogs, setServerJournalLogs] = useState<ActivityLog[]>(() =>
    getLogsForAccount(logs, account)
  );
  const [quickSummary, setQuickSummary] = useState("");
  const [quickDetails, setQuickDetails] = useState("");
  const [quickNextStep, setQuickNextStep] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstDetailRender = useRef(true);
  const [updatingFollowUpId, setUpdatingFollowUpId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loggingOrder, setLoggingOrder] = useState(false);
  const [orderDraft, setOrderDraft] = useState({
    orderDate: todayISO(),
    amount: "",
    notes: "",
  });

  useEffect(() => {
    async function loadOrders() {
      try {
        const response = await fetch(`/api/orders?accountId=${accountId}`);
        if (!response.ok) throw new Error("Failed to load orders");
        const data: OrderRecord[] = await response.json();
        setOrders(data);
      } catch {
        setOrders([]);
      } finally {
        setLoadingOrders(false);
      }
    }

    loadOrders();
  }, [accountId]);

  useEffect(() => {
    setServerJournalLogs(getLogsForAccount(logs, account));
    setActivityOverrides({});
    setSavedDetailDraft({
      accountName: account.account,
      contactName: "contactName" in account ? account.contactName : "",
      type: account.type || "",
      location: "location" in account ? account.location || "" : "",
      phone: account.phone || "",
      email: account.email || "",
      order: "order" in account ? account.order || "" : "",
    });
    setDetailDraft({
      accountName: account.account,
      contactName: "contactName" in account ? account.contactName : "",
      type: account.type || "",
      location: "location" in account ? account.location || "" : "",
      phone: account.phone || "",
      email: account.email || "",
      order: "order" in account ? account.order || "" : "",
    });
    setSavedNotes(account.notes);
    setSavedNextSteps(account.nextSteps);
    setNotes(account.notes);
    setNextSteps(account.nextSteps);
    setCurrentStatus(account.status);
    isFirstDetailRender.current = true;
  }, [account, logs]);

  useEffect(() => {
    if (isFirstDetailRender.current) {
      isFirstDetailRender.current = false;
      return;
    }
    if (JSON.stringify(detailDraft) === JSON.stringify(savedDetailDraft)) return;

    setAutoSaveStatus("idle");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    autoSaveTimer.current = setTimeout(() => {
      void (async () => {
        setAutoSaveStatus("saving");
        try {
          const response = await fetch("/api/sheets/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tab: account._tab,
              rowIndex: account._rowIndex,
              accountName: detailDraft.accountName,
              contactName: detailDraft.contactName,
              type: detailDraft.type,
              location: "location" in account ? detailDraft.location : undefined,
              phone: detailDraft.phone,
              email: detailDraft.email,
              order: "order" in account ? detailDraft.order : undefined,
              expectedValues: { accountName: savedDetailDraft.accountName || "" },
            }),
          });
          if (response.status === 409) {
            await fetchAllTabs();
            setAutoSaveStatus("error");
            showActionFeedback("Sheet changed before auto-save. Latest data reloaded.", "error");
            return;
          }
          if (!response.ok) throw new Error("Save failed");
          setSavedDetailDraft(detailDraft);
          setAutoSaveStatus("saved");
          if (autoSaveStatusTimer.current) clearTimeout(autoSaveStatusTimer.current);
          autoSaveStatusTimer.current = setTimeout(() => setAutoSaveStatus("idle"), 2500);
        } catch {
          setAutoSaveStatus("error");
        }
      })();
    }, 1500);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailDraft]);

  const contactName = "contactName" in account ? account.contactName : "";
  const primaryContact = detailDraft.contactName || contactName;
  const localLogs = useMemo(
    () => getLogsForAccount(outreachEntriesToActivityLogs(outreachStore.entries), account),
    [account, outreachStore.entries]
  );
  const journalEntries = useMemo(
    () =>
      mergeActivityLogs(localLogs, serverJournalLogs).map((entry) =>
        activityOverrides[entry.id] ? { ...entry, ...activityOverrides[entry.id] } : entry
      ),
    [activityOverrides, localLogs, serverJournalLogs]
  );

  const visibleJournalEntries = useMemo(() => {
    const deletedSet = new Set(deletedLogs.map((e) => e.id));
    return journalEntries.filter((entry) => !deletedSet.has(entry.id));
  }, [deletedLogs, journalEntries]);

  const lastContactLog = useMemo(
    () => visibleJournalEntries.find((entry) => countsAsContact(entry)) ?? null,
    [visibleJournalEntries]
  );
  const lastTouch = lastContactLog?.created_at ?? account.contactDate ?? null;
  const followUpsScheduled = visibleJournalEntries.filter((log) => Boolean(log.follow_up_date)).length;
  const journalCountLabel = `${visibleJournalEntries.length} ${visibleJournalEntries.length === 1 ? "entry" : "entries"}`;
  const orderStats = useMemo(() => getOrderStats(orders), [orders]);
  const mostRecentPurchase = orderStats.latest
    ? `$${orderStats.latest.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} on ${formatDateShort(orderStats.latest.order_date)}`
    : ("order" in account ? detailDraft.order || "No order logged" : "Tracked outside Active Accounts");

  const timelineStats = useMemo(
    () => ({
      totalTouches: visibleJournalEntries.length,
      calls: visibleJournalEntries.filter((entry) => entry.action_type === "call").length,
      emails: visibleJournalEntries.filter((entry) => entry.action_type === "email").length,
      meetings: visibleJournalEntries.filter((entry) => entry.action_type === "in-person").length,
    }),
    [visibleJournalEntries]
  );

  const nextFollowUpLog = useMemo(
    () => getScheduledFollowUpLogForAccount(visibleJournalEntries, account),
    [account, visibleJournalEntries]
  );
  const nextFollowUp = nextFollowUpLog?.follow_up_date ?? "";
  const accountHealth = useMemo(() => getAccountHealth(account, visibleJournalEntries), [account, visibleJournalEntries]);

  const saveField = async (field: "notes" | "nextSteps", value: string) => {
    setSaving(true);
    try {
      const response = await fetch("/api/sheets/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab: account._tab,
          rowIndex: account._rowIndex,
          [field]: value,
          expectedValues: {
            [field]: field === "nextSteps" ? savedNextSteps || "" : savedNotes || "",
          },
        }),
      });
      if (response.status === 409) {
        await fetchAllTabs();
        throw new Error("Conflict");
      }
      if (!response.ok) throw new Error("Failed to save field");
      if (field === "nextSteps") {
        setSavedNextSteps(value);
        setNextSteps(value);
      } else {
        setSavedNotes(value);
        setNotes(value);
      }
      showActionFeedback(`${field === "nextSteps" ? "Next steps" : "Notes"} saved.`, "success");
    } catch {
      showActionFeedback(
        `Couldn’t save ${field === "nextSteps" ? "next steps" : "notes"}. The sheet changed, so the latest data was reloaded.`,
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const saveAccountDetails = async () => {
    setSavingDetails(true);
    try {
      const response = await fetch("/api/sheets/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab: account._tab,
          rowIndex: account._rowIndex,
          accountName: detailDraft.accountName,
          contactName: detailDraft.contactName,
          type: detailDraft.type,
          location: "location" in account ? detailDraft.location : undefined,
          phone: detailDraft.phone,
          email: detailDraft.email,
          order: "order" in account ? detailDraft.order : undefined,
          expectedValues: {
            accountName: savedDetailDraft.accountName || "",
          },
        }),
      });
      if (response.status === 409) {
        await fetchAllTabs();
        throw new Error("Conflict");
      }
      if (!response.ok) throw new Error("Failed to save account details");
      setSavedDetailDraft(detailDraft);
      showActionFeedback("Account details saved.", "success");
    } catch {
      showActionFeedback("Couldn’t save account details because the sheet changed. The latest row was reloaded.", "error");
    } finally {
      setSavingDetails(false);
    }
  };

  const addJournalEntry = async (entry: {
    actionType: string;
    note: string;
    followUpDate?: string;
    statusAfter?: string;
    source?: string;
    activityKind?: "outreach" | "note" | "research" | "order";
    countsAsContact?: boolean;
  }) => {
    const statusAfter = entry.statusAfter ?? currentStatus;
    const { log, persistedRemotely } = await persistActivityEntry({
      account,
      actionType: entry.actionType,
      note: entry.note,
      followUpDate: entry.followUpDate || null,
      statusBefore: currentStatus,
      statusAfter,
      source: entry.source ?? (entry.actionType === "note" ? "internal" : "manual"),
      activityKind: entry.activityKind ?? (entry.actionType === "note" ? "note" : "outreach"),
      countsAsContact: entry.countsAsContact ?? (entry.actionType !== "note"),
    });

    if (persistedRemotely) {
      setServerJournalLogs((existing) => mergeActivityLogs([log], existing));
    } else {
      showActionFeedback("Saved locally. Cloud sync failed for this timeline entry.", "info");
    }

    return log;
  };

  const refreshServerJournalLogs = async () => {
    try {
      const response = await fetch("/api/activity", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load activity");
      const data: ActivityLog[] = await response.json();
      setServerJournalLogs(getLogsForAccount(data, account));
    } catch {
      showActionFeedback("Couldn’t refresh the account timeline.", "error");
    }
  };

  const handleSubmitOutreach = async (data: {
    actionType: string;
    statusAfter: string;
    note: string;
    followUpDate: string;
  }) => {
    await addJournalEntry(data);

    try {
      const response = await fetch("/api/sheets/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab: account._tab,
          rowIndex: account._rowIndex,
          newStatus: data.statusAfter,
          contactDate: todayISO(),
          nextSteps: data.note,
          expectedValues: {
            newStatus: currentStatus || "",
            nextSteps: savedNextSteps || "",
          },
        }),
      });
      if (response.status === 409) {
        await fetchAllTabs();
        throw new Error("Conflict");
      }
      if (!response.ok) throw new Error("Failed to update sheet");
      setCurrentStatus(data.statusAfter);
      setSavedNextSteps(data.note);
      setNextSteps(data.note);
      await fetchAllTabs();
      showActionFeedback("Outreach logged and account updated.", "success");
    } catch {
      showActionFeedback("Outreach saved locally, but the sheet update failed.", "error");
    }

    if (data.followUpDate) {
      try {
        await fetch("/api/notion/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountName: account.account,
            contactName: primaryContact,
            followUpDate: data.followUpDate,
            accountUrl: window.location.href,
          }),
        });
      } catch { /* non-blocking */ }
    }
  };

  const clearScheduledFollowUp = async (log: ActivityLog) => {
    if (!log.follow_up_date) return;

    const previousFollowUpDate = log.follow_up_date;
    const localEntry = outreachStore.entries.find((entry) => entry.id === log.id);

    setUpdatingFollowUpId(log.id);
    setActivityOverrides((existing) => ({
      ...existing,
      [log.id]: {
        ...(existing[log.id] ?? {}),
        follow_up_date: null,
      },
    }));

    if (localEntry) {
      outreachStore.updateEntry(log.id, { follow_up_date: null });
    }

    try {
      if (!localEntry) {
        const response = await fetch("/api/activity", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: log.id,
            follow_up_date: null,
          }),
        });
        if (!response.ok) throw new Error("Failed to clear follow-up");
        const updatedLog: ActivityLog = await response.json();
        setServerJournalLogs((existing) =>
          existing.map((entry) => (entry.id === updatedLog.id ? updatedLog : entry))
        );
      }

      showActionFeedbackWithAction(
        `Cleared scheduled follow-up for ${account.account}.`,
        "Undo",
        async () => {
          if (localEntry) {
            outreachStore.updateEntry(log.id, { follow_up_date: previousFollowUpDate });
          } else {
            const response = await fetch("/api/activity", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: log.id,
                follow_up_date: previousFollowUpDate,
              }),
            });
            if (response.ok) {
              const restoredLog: ActivityLog = await response.json();
              setServerJournalLogs((existing) =>
                existing.map((entry) => (entry.id === restoredLog.id ? restoredLog : entry))
              );
            }
          }

          setActivityOverrides((existing) => ({
            ...existing,
            [log.id]: {
              ...(existing[log.id] ?? {}),
              follow_up_date: previousFollowUpDate,
            },
          }));
        },
        "info"
      );
    } catch {
      setActivityOverrides((existing) => ({
        ...existing,
        [log.id]: {
          ...(existing[log.id] ?? {}),
          follow_up_date: previousFollowUpDate,
        },
      }));

      if (localEntry) {
        outreachStore.updateEntry(log.id, { follow_up_date: previousFollowUpDate });
      }

      showActionFeedback(`Couldn’t clear the follow-up for ${account.account}.`, "error");
    } finally {
      setUpdatingFollowUpId(null);
    }
  };

  const handleSaveQuickNote = async () => {
    const note = formatActivityNote({
      summary: quickSummary,
      details: quickDetails,
      nextStep: quickNextStep,
    });

    if (!note) return;

    setSavingNote(true);
    try {
      await addJournalEntry({
        actionType: "note",
        note,
        source: "internal",
        activityKind: "note",
        countsAsContact: false,
      });
      setQuickSummary("");
      setQuickDetails("");
      setQuickNextStep("");
    } finally {
      setSavingNote(false);
    }
  };

  const handleLogOrder = async () => {
    const amount = parseFloat(orderDraft.amount);
    if (!Number.isFinite(amount)) return;

    setLoggingOrder(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          account_name: account.account,
          tab: account._tabSlug,
          order_date: orderDraft.orderDate,
          amount,
          notes: orderDraft.notes || null,
        }),
      });

      if (response.ok) {
        const created: OrderRecord = await response.json();
        setOrders((existing) => [created, ...existing]);
      }

      if (account._tab === "Active Accounts") {
        const sheetResponse = await fetch("/api/sheets/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tab: account._tab,
            rowIndex: account._rowIndex,
            order: `$${amount.toFixed(0)}`,
            expectedValues: {
              order: savedDetailDraft.order || "",
            },
          }),
        });

        if (sheetResponse.status === 409) {
          await fetchAllTabs();
          throw new Error("Conflict");
        }

        if (!sheetResponse.ok) {
          throw new Error("Failed to update order");
        }
      }

      setSavedDetailDraft((prev) => ({
        ...prev,
        order: `$${amount.toFixed(0)}`,
      }));
      setDetailDraft((prev) => ({
        ...prev,
        order: `$${amount.toFixed(0)}`,
      }));
      setOrderDraft({
        orderDate: todayISO(),
        amount: "",
        notes: "",
      });
      await fetchAllTabs();
      showActionFeedback("Order logged.", "success");
    } catch {
      showActionFeedback("Order saved, but the sheet row changed before the purchase value updated.", "error");
    } finally {
      setLoggingOrder(false);
    }
  };

  return (
    <div className="space-y-4">
      <PitchReminder accountName={account.account} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        {/* Left column - account info */}
        <div className="space-y-4">
          <Card>
            <div className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">{detailDraft.accountName}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge status={currentStatus} />
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        accountHealth.tone === "healthy"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                          : accountHealth.tone === "watch"
                            ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
                            : accountHealth.tone === "at-risk"
                              ? "border-orange-400/30 bg-orange-400/10 text-orange-100"
                              : "border-rs-punch/40 bg-rs-punch/10 text-[#ffd6e8]"
                      }`}
                      title={accountHealth.reasons.join(" · ") || "Account looks healthy"}
                    >
                      {accountHealth.label} {accountHealth.score}
                    </span>
                    <span className="text-sm text-gray-400">{detailDraft.type || account.type}</span>
                    {lastTouch && (
                      <span className="text-xs text-[#af9fe6]">
                        Last touch {formatDate(lastTouch)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={currentStatus}
                    onChange={async (e) => {
                      const newStatus = e.target.value;
                      const previousStatus = currentStatus;
                      setCurrentStatus(newStatus);
                      const response = await fetch("/api/sheets/update", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          tab: account._tab,
                          rowIndex: account._rowIndex,
                          newStatus,
                          expectedValues: {
                            newStatus: previousStatus || "",
                          },
                        }),
                      });

                      if (response.status === 409) {
                        setCurrentStatus(previousStatus);
                        await fetchAllTabs();
                        showActionFeedback("That status changed before your update saved. I refreshed the latest row.", "error");
                        return;
                      }

                      if (!response.ok) {
                        setCurrentStatus(previousStatus);
                        showActionFeedback("Couldn’t update the account status.", "error");
                        return;
                      }

                      showActionFeedback("Status updated.", "success");
                    }}
                    options={STATUS_VALUES.filter((value) => value !== "").map((value) => ({
                      value,
                      label: value,
                    }))}
                    className="min-w-[180px]"
                  />
                  <Button onClick={() => setShowLogModal(true)}>Log Outreach</Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Account Name"
                  value={detailDraft.accountName}
                  onChange={(e) => setDetailDraft((prev) => ({ ...prev, accountName: e.target.value }))}
                />
                <Input
                  label="Primary Contact"
                  value={detailDraft.contactName}
                  onChange={(e) => setDetailDraft((prev) => ({ ...prev, contactName: e.target.value }))}
                />
                <Input
                  label="Type"
                  value={detailDraft.type}
                  onChange={(e) => setDetailDraft((prev) => ({ ...prev, type: e.target.value }))}
                />
                {"location" in account && (
                  <Input
                    label="Location"
                    value={detailDraft.location}
                    onChange={(e) => setDetailDraft((prev) => ({ ...prev, location: e.target.value }))}
                  />
                )}
                <Input
                  label="Phone"
                  value={detailDraft.phone}
                  onChange={(e) => setDetailDraft((prev) => ({ ...prev, phone: e.target.value }))}
                />
                <Input
                  label="Email"
                  value={detailDraft.email}
                  onChange={(e) => setDetailDraft((prev) => ({ ...prev, email: e.target.value }))}
                />
                {"order" in account && (
                  <Input
                    label="Most Recent Purchase"
                    value={detailDraft.order}
                    onChange={(e) => setDetailDraft((prev) => ({ ...prev, order: e.target.value }))}
                  />
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-rs-border/60 bg-black/10 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#af9fe6]">Health Score</div>
                  <div className="mt-2 text-sm text-rs-cream">{accountHealth.label} · {accountHealth.score}</div>
                  <div className="mt-2 text-xs text-[#d8ccfb]">
                    {accountHealth.reasons[0] || "No urgent cleanup flags"}
                  </div>
                </div>
                <div className="rounded-2xl border border-rs-border/60 bg-black/10 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#af9fe6]">Next Follow-Up</div>
                  <div className="mt-2 text-sm text-rs-cream">{nextFollowUp ? formatDate(nextFollowUp) : "No follow-up scheduled"}</div>
                  <div className="mt-2 text-xs text-[#d8ccfb]">
                    {nextFollowUp ? "Scheduled from the timeline" : "Add one from a log entry"}
                  </div>
                </div>
                {"kitchen" in account && (
                  <div className="rounded-2xl border border-rs-border/60 bg-black/10 p-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-[#af9fe6]">Kitchen</div>
                    <div className="mt-2 text-sm text-rs-cream">{account.kitchen || "Unknown"}</div>
                  </div>
                )}
                {"estMonthlyOrder" in account && (
                  <div className="rounded-2xl border border-rs-border/60 bg-black/10 p-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-[#af9fe6]">Est. Monthly</div>
                    <div className="mt-2 text-sm text-rs-cream">{account.estMonthlyOrder || "Unknown"}</div>
                  </div>
                )}
                <div className="rounded-2xl border border-rs-border/60 bg-black/10 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#af9fe6]">Recent Purchase</div>
                  <div className="mt-2 text-sm text-rs-cream">{mostRecentPurchase}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <QuickActions phone={detailDraft.phone} email={detailDraft.email} />
                <div className="text-xs">
                  {autoSaveStatus === "saving" && <span className="text-[#af9fe6]">Saving…</span>}
                  {autoSaveStatus === "saved" && <span className="text-emerald-400">Saved ✓</span>}
                  {autoSaveStatus === "error" && <span className="text-rs-punch">Couldn&apos;t save</span>}
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Deal Snapshot</div>
                  <div className="mt-1 text-sm text-[#d8ccfb]">
                    Review active deal health, latest order context, and what happens next.
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SnapshotStat label="Timeline Entries" value={String(timelineStats.totalTouches)} />
                  <SnapshotStat label="Calls Logged" value={String(timelineStats.calls)} />
                  <SnapshotStat label="Emails Logged" value={String(timelineStats.emails)} />
                  <SnapshotStat label="Meetings Logged" value={String(timelineStats.meetings)} />
                  <SnapshotStat label="Orders Logged" value={String(orderStats.count)} />
                  <SnapshotStat
                    label="Lifetime Ordered"
                    value={`$${orderStats.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                  />
                </div>
              </div>
            </Card>

            <ContactManager
              accountId={accountId}
              defaultContact={{
                name: primaryContact,
                email: detailDraft.email,
                phone: detailDraft.phone,
              }}
            />
          </div>

          <Card>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                  <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Account Folder</div>
                  <div className="mt-1 text-sm text-[#d8ccfb]">
                    {journalCountLabel}
                    {lastTouch ? `, last touch ${new Date(lastTouch).toLocaleDateString()}` : ", no touches logged yet"}
                  </div>
                </div>
                <div className="rounded-full border border-rs-border/70 bg-white/5 px-3 py-1 text-xs text-rs-gold">
                  {followUpsScheduled} follow-up{followUpsScheduled === 1 ? "" : "s"} scheduled
                </div>
              </div>

              {nextFollowUp && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rs-gold/30 bg-rs-gold/10 px-3 py-2 text-sm text-rs-cream">
                  <span>Next follow-up: {formatDate(nextFollowUp)}</span>
                  {nextFollowUpLog && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={updatingFollowUpId === nextFollowUpLog.id}
                      onClick={() => clearScheduledFollowUp(nextFollowUpLog)}
                    >
                      {updatingFollowUpId === nextFollowUpLog.id ? "Clearing..." : "Clear Schedule"}
                    </Button>
                  )}
                </div>
              )}

              <Textarea
                label="Next Steps"
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                onBlur={() => saveField("nextSteps", nextSteps)}
              />
              <Textarea
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => saveField("notes", notes)}
              />
              {saving && <div className="text-xs text-gray-500">Saving...</div>}
            </div>
          </Card>

          <Card>
            <div className="space-y-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Order Log</div>
                <div className="mt-1 text-sm text-[#d8ccfb]">
                  Track order history here. The latest order rolls up into Active Accounts.
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[160px_160px_minmax(0,1fr)]">
                <Input
                  label="Order Date"
                  type="date"
                  value={orderDraft.orderDate}
                  onChange={(e) => setOrderDraft((prev) => ({ ...prev, orderDate: e.target.value }))}
                />
                <Input
                  label="Amount"
                  inputMode="decimal"
                  value={orderDraft.amount}
                  onChange={(e) => setOrderDraft((prev) => ({ ...prev, amount: e.target.value }))}
                  placeholder="250"
                />
                <Input
                  label="Notes"
                  value={orderDraft.notes}
                  onChange={(e) => setOrderDraft((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Restock for patio weekend, first reorder, test run"
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleLogOrder} disabled={loggingOrder || !orderDraft.amount.trim()}>
                  {loggingOrder ? "Logging..." : "Log Order"}
                </Button>
              </div>

              {loadingOrders ? (
                <div className="text-sm text-[#af9fe6]">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="rounded-xl border border-rs-border/60 bg-black/10 px-3 py-3 text-sm text-[#d8ccfb]">
                  No orders logged yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="rounded-xl border border-rs-border/60 bg-black/10 px-3 py-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-rs-cream">
                          ${order.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-xs text-[#af9fe6]">{formatDate(order.order_date)}</div>
                      </div>
                      {order.notes && (
                        <div className="mt-2 text-[#d8ccfb]">{order.notes}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-rs-cream">Add Internal Note</div>
                <p className="mt-1 text-sm text-[#d8ccfb]">
                  Keep account-specific context, objections, timing, and next moves inside this account folder.
                </p>
              </div>

              <Input
                label="Summary"
                value={quickSummary}
                onChange={(e) => setQuickSummary(e.target.value)}
                placeholder="Decision maker asked for pricing sheet, samples landed well, venue is closing for patio work"
              />

              <Textarea
                label="Details"
                value={quickDetails}
                onChange={(e) => setQuickDetails(e.target.value)}
                placeholder="Anything you want to remember later"
                rows={4}
              />

              <Input
                label="Next Move"
                value={quickNextStep}
                onChange={(e) => setQuickNextStep(e.target.value)}
                placeholder="Call back Tuesday morning, send draft menu, ask for buyer intro"
              />

              <div className="flex justify-end">
                <Button onClick={handleSaveQuickNote} disabled={savingNote || !quickSummary.trim() && !quickDetails.trim()}>
                  {savingNote ? "Saving..." : "Save Note to Folder"}
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Right column - activity log */}
        <div className="space-y-4">
          <PlaybookPanel account={account} />

          <Card>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Account Folder Timeline</h3>
            <ActivityLogList
              logs={visibleJournalEntries}
              onClearFollowUp={clearScheduledFollowUp}
              pendingFollowUpId={updatingFollowUpId}
              onServerLogsChanged={refreshServerJournalLogs}
            />
          </Card>
        </div>
      </div>

      {showLogModal && (
        <LogOutreachModal
          account={account}
          onClose={() => setShowLogModal(false)}
          onSubmit={handleSubmitOutreach}
        />
      )}
    </div>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-rs-border/60 bg-black/10 p-3">
      <div className="text-[11px] uppercase tracking-[0.2em] text-[#af9fe6]">{label}</div>
      <div className="mt-2 text-2xl font-black text-rs-cream">{value}</div>
    </div>
  );
}
