"use client";

import { useState } from "react";
import { AnyAccount } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { STATUS_VALUES, NEXT_ACTION_TYPES } from "@/lib/utils/constants";
import { formatActivityNote, parseActivityNote } from "@/lib/activity/notes";

interface LogOutreachModalProps {
  account: AnyAccount;
  initialLog?: ActivityLog | null;
  suggestedNextStep?: string;
  submitLabel?: string;
  title?: string;
  onClose: () => void;
  onSubmit: (data: {
    actionType: string;
    statusAfter: string;
    note: string;
    followUpDate: string;
    nextActionType: string;
  }) => Promise<void>;
}

const ACTION_TYPES = [
  { key: "call",             label: "Call" },
  { key: "email",            label: "Email" },
  { key: "in-person",        label: "In Person" },
  { key: "sample-sent",      label: "Sample Sent" },
  { key: "tasting-complete", label: "Tasting Done" },
];

const NOTE_SNIPPETS: Record<string, string[]> = {
  call:               ["Left voicemail", "Spoke to owner", "Reached GM", "Couldn't reach"],
  email:              ["Sent intro email", "Sent follow-up", "Sent menu/pricing", "Sent sample request"],
  "in-person":        ["Dropped in", "Met with owner", "Dropped samples", "Met in person"],
  "sample-sent":      ["Dropped off samples", "Shipped samples", "Left at front desk", "Hand-delivered"],
  "tasting-complete": ["Loved it", "Positive feedback", "Had questions on price", "Wants to revisit"],
};

const STATUS_SUGGESTIONS: Record<string, string> = {
  "call":             "Reached Out",
  "email":            "Reached Out",
  "in-person":        "Connected",
  "sample-sent":      "Sample Sent",
  "tasting-complete": "Tasting Complete",
};

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(days: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function nextWeekday(targetDay: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const daysUntilTarget = (targetDay - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilTarget);
  return toDateInputValue(date);
}

export function LogOutreachModal({
  account,
  initialLog = null,
  suggestedNextStep,
  submitLabel,
  title,
  onClose,
  onSubmit,
}: LogOutreachModalProps) {
  const parsedInitialNote = parseActivityNote(initialLog?.note ?? null);
  const initialActionType = ACTION_TYPES.map((a) => a.key).includes(initialLog?.action_type ?? "")
    ? initialLog?.action_type ?? "call"
    : "call";
  const [actionType, setActionType] = useState<string>(initialActionType);
  const [statusAfter, setStatusAfter] = useState<string>(
    initialLog?.status_after || account.status || "Reached Out"
  );
  const [nextActionType, setNextActionType] = useState<string>(
    initialLog?.next_action_type || ""
  );
  const [summary, setSummary] = useState(parsedInitialNote.summary ?? "");
  const [details, setDetails] = useState(parsedInitialNote.details ?? "");
  const [nextMove, setNextMove] = useState(parsedInitialNote.nextStep ?? suggestedNextStep ?? "");
  const [followUpDate, setFollowUpDate] = useState(initialLog?.follow_up_date || "");
  const [showCalendar, setShowCalendar] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isBackburner = statusAfter === "Backburner";

  const followUpPresets = isBackburner
      ? [
          { label: "2 Weeks", value: addDays(14) },
          { label: "1 Month",  value: addDays(30) },
          { label: "3 Months", value: addDays(90) },
          { label: "6 Months", value: addDays(180) },
        ]
      : [
          { label: "Tomorrow",  value: addDays(1) },
          { label: "2 Days",    value: addDays(2) },
          { label: "Friday",    value: nextWeekday(5) },
          { label: "Next Week", value: nextWeekday(1) },
        ];

  function handleActionTypeSelect(type: string) {
    setActionType(type);
    const suggestedStatus = STATUS_SUGGESTIONS[type];
    if (suggestedStatus) setStatusAfter(suggestedStatus);
    setSummary("");
  }

  const handleSubmit = async () => {
    const note = formatActivityNote({
      summary,
      details,
      nextStep: nextMove,
    });

    if (!note) return;

    setSubmitting(true);
    try {
      await onSubmit({ actionType, statusAfter, note, followUpDate, nextActionType });
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  const snippets = NOTE_SNIPPETS[actionType] ?? NOTE_SNIPPETS.call;

  return (
    <Modal title={title ?? `Log Outreach — ${account.account}`} onClose={onClose}>
      <div className="flex flex-col gap-4">

        {/* Action Type */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">What happened?</label>
          <div className="flex flex-wrap gap-2">
            {ACTION_TYPES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleActionTypeSelect(key)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  actionType === key
                    ? key === "sample-sent"
                      ? "bg-[#64f5ea] text-rs-bg font-semibold"
                      : key === "tasting-complete"
                      ? "bg-[#a78bfa] text-white font-semibold"
                      : "bg-rs-gold text-rs-bg font-semibold"
                    : "bg-rs-bg border border-rs-border text-gray-300 hover:border-rs-gold"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {actionType === "sample-sent" && (
            <p className="mt-2 text-xs text-[#64f5ea]">
              Status will advance to &quot;Sample Sent&quot;. Set a follow-up for 5–7 days to check for feedback.
            </p>
          )}
          {actionType === "tasting-complete" && (
            <p className="mt-2 text-xs text-[#a78bfa]">
              Status will advance to &quot;Tasting Complete&quot;. Log their feedback below. Set a tight follow-up to push toward a decision.
            </p>
          )}
        </div>

        {/* Status */}
        <Select
          label="Update Status"
          value={statusAfter}
          onChange={(e) => setStatusAfter(e.target.value)}
          options={STATUS_VALUES.map((s) => ({ value: s, label: s }))}
        />

        {/* Backburner resurface nudge */}
        {isBackburner && (
          <div className="rounded-lg border border-[#8c7fbd]/40 bg-[#8c7fbd]/10 px-3 py-2 text-sm text-[#d4c8f0]">
            <span className="font-semibold text-[#d4c8f0]">Set a resurface date below.</span> When moved to Backburner, a date queues this account to reappear on your Dashboard — so it doesn&apos;t fall through the cracks.
          </div>
        )}

        {/* Outcome Summary */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">Outcome Summary</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {snippets.map((snippet) => (
              <button
                key={snippet}
                type="button"
                onClick={() => setSummary(snippet)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  summary === snippet
                    ? "border-rs-gold bg-rs-gold/20 text-rs-gold"
                    : "border-rs-border bg-white/5 text-[#af9fe6] hover:border-rs-gold/50 hover:text-rs-cream"
                }`}
              >
                {snippet}
              </button>
            ))}
          </div>
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={
              actionType === "tasting-complete"
                ? "Their reaction, feedback, main objections"
                : actionType === "sample-sent"
                ? "What you dropped off, who you left it with"
                : "Reached GM, left voicemail, sent menu, booked tasting"
            }
          />
        </div>

        <Textarea
          label={actionType === "tasting-complete" ? "Tasting Feedback & Details" : "Details"}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={
            actionType === "tasting-complete"
              ? "What did they think? Any objections? Price concern? Timeline? Who else needs to try it?"
              : "Capture what happened, objections, timing, and anything you want to remember."
          }
          rows={4}
        />

        {/* Next Action Type */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">Next Action</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setNextActionType("")}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                nextActionType === ""
                  ? "border-rs-gold bg-rs-gold/20 text-rs-gold"
                  : "border-rs-border bg-white/5 text-[#af9fe6] hover:border-rs-gold/50"
              }`}
            >
              None
            </button>
            {NEXT_ACTION_TYPES.map(({ value, label, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => setNextActionType(nextActionType === value ? "" : value)}
                style={{
                  borderColor: nextActionType === value ? color : undefined,
                  color: nextActionType === value ? color : undefined,
                  background: nextActionType === value ? `${color}18` : undefined,
                }}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  nextActionType === value
                    ? ""
                    : "border-rs-border bg-white/5 text-[#af9fe6] hover:border-rs-gold/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Next Move (free text)"
          value={nextMove}
          onChange={(e) => setNextMove(e.target.value)}
          placeholder="Follow up Thursday after 2pm, send pricing sheet, drop samples"
        />

        {/* Follow-up Date */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">
            Follow-up Date{isBackburner ? " — when to resurface" : " (optional)"}
          </label>
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {followUpPresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setFollowUpDate(preset.value);
                  setShowCalendar(false);
                }}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  followUpDate === preset.value
                    ? "border-rs-gold bg-rs-gold text-rs-bg"
                    : "border-rs-border bg-white/5 text-gray-300 hover:border-rs-gold hover:text-rs-cream"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowCalendar(!showCalendar)}
            className="w-full bg-rs-bg border border-rs-border rounded-lg px-3 py-2 text-white text-sm text-left hover:border-rs-gold focus:outline-none"
            aria-expanded={showCalendar}
          >
            {followUpDate ? followUpDate : "Click to select date"}
          </button>
          {showCalendar && (
            <DatePicker
              value={followUpDate}
              onChange={(date) => {
                setFollowUpDate(date);
                setShowCalendar(false);
              }}
            />
          )}
          {followUpDate && (
            <button
              type="button"
              onClick={() => {
                setFollowUpDate("");
                setShowCalendar(false);
              }}
              className="mt-2 text-xs text-[#af9fe6] hover:text-rs-gold"
            >
              Clear date
            </button>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || (!summary.trim() && !details.trim())}>
            {submitting ? "Saving..." : submitLabel ?? "Log Outreach"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DatePicker({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const today = new Date();
  const initial = value ? new Date(value + "T00:00:00") : today;
  const [month, setMonth] = useState(initial.getMonth());
  const [year, setYear] = useState(initial.getFullYear());

  const goToPreviousMonth = () => {
    setMonth((currentMonth) => {
      if (currentMonth > 0) return currentMonth - 1;
      setYear((currentYear) => currentYear - 1);
      return 11;
    });
  };

  const goToNextMonth = () => {
    setMonth((currentMonth) => {
      if (currentMonth < 11) return currentMonth + 1;
      setYear((currentYear) => currentYear + 1);
      return 0;
    });
  };

  const daysInMonth = (m: number, y: number) => new Date(y, m + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const days = Array.from({ length: daysInMonth(month, year) }, (_, i) => i + 1);
  const weeks = [];
  let week = Array(firstDay).fill(null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push([...week, ...Array(7 - week.length).fill(null)]);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const selected = value ? new Date(value + "T00:00:00") : null;

  return (
    <div className="mt-2 w-full rounded-lg border border-rs-border bg-rs-surface p-3 shadow-lg">
      <div className="flex items-center justify-between mb-3 gap-2">
        <button
          type="button"
          onClick={goToPreviousMonth}
          className="h-8 w-8 rounded-md border border-rs-border text-sm text-gray-300 hover:border-rs-gold hover:text-white"
          aria-label="Previous month"
        >
          ←
        </button>
        <div className="text-sm font-semibold text-gray-200">
          {monthNames[month]} {year}
        </div>
        <button
          type="button"
          onClick={goToNextMonth}
          className="h-8 w-8 rounded-md border border-rs-border text-sm text-gray-300 hover:border-rs-gold hover:text-white"
          aria-label="Next month"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
          <div key={d} className="w-6 h-6 text-center text-gray-500">{d}</div>
        ))}
        {weeks.map((week, i) =>
          week.map((day, j) => (
            <button
              type="button"
              key={`${i}-${j}`}
              onClick={() => {
                if (day) {
                  const d = String(day).padStart(2, "0");
                  const m = String(month + 1).padStart(2, "0");
                  onChange(`${year}-${m}-${d}`);
                }
              }}
              disabled={day === null}
              className={`w-7 h-7 text-xs rounded ${
                day === null
                  ? "cursor-default"
                  : selected &&
                    selected.getDate() === day &&
                    selected.getMonth() === month &&
                    selected.getFullYear() === year
                  ? "bg-rs-gold text-rs-bg"
                  : "text-gray-300 hover:bg-rs-border"
              }`}
            >
              {day}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
