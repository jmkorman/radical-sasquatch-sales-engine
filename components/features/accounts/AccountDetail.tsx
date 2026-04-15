"use client";

import { useMemo, useState } from "react";
import { AnyAccount } from "@/types/accounts";
import { ActivityLog, ActionType } from "@/types/activity";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { PitchReminder } from "./PitchReminder";
import { ActivityLogList } from "./ActivityLog";
import { QuickActions } from "./QuickActions";
import { LogOutreachModal } from "@/components/features/dashboard/LogOutreachModal";
import { todayISO, formatDate } from "@/lib/utils/dates";
import { formatPhone } from "@/lib/utils/phone";
import { formatActivityNote } from "@/lib/activity/notes";
import { useOutreachStore, OutreachEntry } from "@/stores/useOutreachStore";
import { STATUS_VALUES } from "@/lib/utils/constants";
import { Select } from "@/components/ui/Select";
import { ContactManager } from "./ContactManager";
import { PlaybookPanel } from "./PlaybookPanel";

function localEntryToLog(e: OutreachEntry, rowIndex: number): ActivityLog {
  return {
    id: e.id,
    account_id: e.account_id,
    tab: e.tab,
    row_index: rowIndex,
    account_name: e.account_name,
    action_type: e.action_type as ActionType,
    note: e.note || null,
    status_before: e.status_before || null,
    status_after: e.status_after || null,
    follow_up_date: e.follow_up_date,
    notion_task_id: null,
    source: "local",
    created_at: e.created_at,
  };
}

interface AccountDetailProps {
  account: AnyAccount;
  logs: ActivityLog[];
}

export function AccountDetail({ account, logs }: AccountDetailProps) {
  const outreachStore = useOutreachStore();
  const accountId = `${account._tabSlug}_${account._rowIndex}`;

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
  const [notes, setNotes] = useState(account.notes);
  const [nextSteps, setNextSteps] = useState(account.nextSteps);
  const [currentStatus, setCurrentStatus] = useState<string>(account.status);
  // Initialize journal with server logs + any local entries not already in server data
  const [journalEntries, setJournalEntries] = useState<ActivityLog[]>(() => {
    const serverIds = new Set(logs.map((l) => l.id));
    const localConverted = outreachStore
      .getEntriesForAccount(accountId)
      .map((e) => localEntryToLog(e, account._rowIndex))
      .filter((e) => !serverIds.has(e.id));
    return [...logs, ...localConverted].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });
  const [quickSummary, setQuickSummary] = useState("");
  const [quickDetails, setQuickDetails] = useState("");
  const [quickNextStep, setQuickNextStep] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);

  const contactName = "contactName" in account ? account.contactName : "";
  const primaryContact = detailDraft.contactName || contactName;

  const lastTouch = journalEntries[0]?.created_at ?? account.contactDate ?? null;
  const followUpsScheduled = journalEntries.filter((log) => Boolean(log.follow_up_date)).length;
  const journalCountLabel = `${journalEntries.length} ${journalEntries.length === 1 ? "entry" : "entries"}`;
  const mostRecentPurchase = "order" in account ? detailDraft.order || "No order logged" : "Tracked outside Active Accounts";

  const timelineStats = useMemo(
    () => ({
      totalTouches: journalEntries.length,
      calls: journalEntries.filter((entry) => entry.action_type === "call").length,
      emails: journalEntries.filter((entry) => entry.action_type === "email").length,
      meetings: journalEntries.filter((entry) => entry.action_type === "in-person").length,
    }),
    [journalEntries]
  );

  const saveField = async (field: "notes" | "nextSteps", value: string) => {
    setSaving(true);
    await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab: account._tab,
        rowIndex: account._rowIndex,
        [field]: value,
      }),
    });
    setSaving(false);
  };

  const saveAccountDetails = async () => {
    setSavingDetails(true);
    try {
      await fetch("/api/sheets/update", {
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
        }),
      });
    } finally {
      setSavingDetails(false);
    }
  };

  const addJournalEntry = async (entry: {
    actionType: string;
    note: string;
    followUpDate?: string;
    statusAfter?: string;
  }) => {
    const statusAfter = entry.statusAfter ?? currentStatus;

    // Save to localStorage immediately (works without Supabase)
    outreachStore.addEntry({
      account_id: accountId,
      account_name: account.account,
      tab: account._tabSlug,
      action_type: entry.actionType,
      note: entry.note,
      status_before: currentStatus,
      status_after: statusAfter,
      follow_up_date: entry.followUpDate || null,
    });

    // Build the new log entry for local state
    const localLog: ActivityLog = {
      id: crypto.randomUUID(),
      account_id: accountId,
      tab: account._tabSlug,
      row_index: account._rowIndex,
      account_name: account.account,
      action_type: entry.actionType as ActionType,
      note: entry.note || null,
      status_before: currentStatus || null,
      status_after: statusAfter || null,
      follow_up_date: entry.followUpDate || null,
      notion_task_id: null,
      source: "local",
      created_at: new Date().toISOString(),
    };
    setJournalEntries((existing) => [localLog, ...existing]);

    // Also send to Supabase (non-blocking - no throw)
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId,
        tab: account._tabSlug,
        row_index: account._rowIndex,
        account_name: account.account,
        action_type: entry.actionType,
        note: entry.note,
        status_before: currentStatus,
        status_after: statusAfter,
        follow_up_date: entry.followUpDate || null,
      }),
    }).catch(() => {});

    return localLog;
  };

  const handleSubmitOutreach = async (data: {
    actionType: string;
    statusAfter: string;
    note: string;
    followUpDate: string;
  }) => {
    await addJournalEntry(data);

    await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab: account._tab,
        rowIndex: account._rowIndex,
        newStatus: data.statusAfter,
        contactDate: todayISO(),
        nextSteps: data.note,
      }),
    });
    setCurrentStatus(data.statusAfter);
    setNextSteps(data.note);

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
      });
      setQuickSummary("");
      setQuickDetails("");
      setQuickNextStep("");
    } finally {
      setSavingNote(false);
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
                    <span className="text-sm text-gray-400">{account.type}</span>
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
                      setCurrentStatus(newStatus);
                      await fetch("/api/sheets/update", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          tab: account._tab,
                          rowIndex: account._rowIndex,
                          newStatus,
                        }),
                      });
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
                <div className="flex items-center gap-2">
                  {savingDetails && <span className="text-xs text-[#af9fe6]">Saving details...</span>}
                  <Button size="sm" onClick={saveAccountDetails}>
                    Save Account Details
                  </Button>
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
            <ActivityLogList logs={journalEntries} />
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
