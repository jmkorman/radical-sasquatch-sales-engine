"use client";

import { useState } from "react";
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
import { todayISO } from "@/lib/utils/dates";
import { formatPhone } from "@/lib/utils/phone";
import { formatActivityNote } from "@/lib/activity/notes";
import { useOutreachStore, OutreachEntry } from "@/stores/useOutreachStore";

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

  const contactName = "contactName" in account ? account.contactName : "";

  const lastTouch = journalEntries[0]?.created_at ?? null;
  const followUpsScheduled = journalEntries.filter((log) => Boolean(log.follow_up_date)).length;
  const journalCountLabel = `${journalEntries.length} ${journalEntries.length === 1 ? "entry" : "entries"}`;

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
            contactName,
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

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Left column - account info */}
        <div className="flex-1 space-y-4">
          <Card>
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">{account.account}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge status={currentStatus} />
                    <span className="text-sm text-gray-400">{account.type}</span>
                  </div>
                </div>
                <Button onClick={() => setShowLogModal(true)}>Log Outreach</Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {contactName && (
                  <div>
                    <span className="text-gray-500">Contact: </span>
                    <span className="text-white">{contactName}</span>
                  </div>
                )}
                {"location" in account && account.location && (
                  <div>
                    <span className="text-gray-500">Location: </span>
                    <span className="text-white">{account.location}</span>
                  </div>
                )}
                {account.phone && (
                  <div>
                    <span className="text-gray-500">Phone: </span>
                    <a href={`tel:${account.phone}`} className="text-rs-gold">{formatPhone(account.phone)}</a>
                  </div>
                )}
                {account.email && (
                  <div>
                    <span className="text-gray-500">Email: </span>
                    <a href={`mailto:${account.email}`} className="text-rs-gold">{account.email}</a>
                  </div>
                )}
                {"ig" in account && account.ig && (
                  <div>
                    <span className="text-gray-500">Instagram: </span>
                    <span className="text-gray-300">{account.ig}</span>
                  </div>
                )}
                {"website" in account && account.website && (
                  <div>
                    <span className="text-gray-500">Website: </span>
                    <a href={account.website.startsWith("http") ? account.website : `https://${account.website}`} target="_blank" rel="noopener noreferrer" className="text-rs-gold">{account.website}</a>
                  </div>
                )}
                {"kitchen" in account && (
                  <div>
                    <span className="text-gray-500">Kitchen: </span>
                    <span className="text-white">{account.kitchen || "Unknown"}</span>
                  </div>
                )}
                {"estMonthlyOrder" in account && account.estMonthlyOrder && (
                  <div>
                    <span className="text-gray-500">Est. Monthly Order: </span>
                    <span className="text-white">{account.estMonthlyOrder}</span>
                  </div>
                )}
              </div>

              <QuickActions phone={account.phone} email={account.email} />
            </div>
          </Card>

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
        <div className="sm:w-80 lg:w-96">
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
