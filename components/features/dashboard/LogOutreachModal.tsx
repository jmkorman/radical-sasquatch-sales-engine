"use client";

import { useState } from "react";
import { AnyAccount } from "@/types/accounts";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { STATUS_VALUES } from "@/lib/utils/constants";
import { formatActivityNote } from "@/lib/activity/notes";
import { getDateISO } from "@/lib/utils/dates";

interface LogOutreachModalProps {
  account: AnyAccount;
  onClose: () => void;
  onSubmit: (data: {
    actionType: string;
    statusAfter: string;
    note: string;
    followUpDate: string;
  }) => Promise<void>;
}

export function LogOutreachModal({
  account,
  onClose,
  onSubmit,
}: LogOutreachModalProps) {
  const [actionType, setActionType] = useState("call");
  const [statusAfter, setStatusAfter] = useState<string>(account.status || "Contacted");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [nextMove, setNextMove] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const note = formatActivityNote({
      summary,
      details,
      nextStep: nextMove,
    });

    if (!note) return;

    setSubmitting(true);
    try {
      await onSubmit({ actionType, statusAfter, note, followUpDate });
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Log Outreach - ${account.account}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm text-gray-300 mb-2">Action Type</label>
          <div className="flex gap-2">
            {["call", "email", "in-person"].map((type) => (
              <button
                key={type}
                onClick={() => setActionType(type)}
                className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                  actionType === type
                    ? "bg-rs-gold text-rs-bg font-medium"
                    : "bg-rs-bg border border-rs-border text-gray-300 hover:border-rs-gold"
                }`}
              >
                {type === "in-person" ? "In-Person" : type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <Select
          label="Update Status"
          value={statusAfter}
          onChange={(e) => setStatusAfter(e.target.value)}
          options={STATUS_VALUES.filter((s) => s !== "").map((s) => ({
            value: s,
            label: s,
          }))}
        />

        <Input
          label="Outcome Summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Reached GM, left voicemail, sent menu, booked sample drop"
        />

        <Textarea
          label="Details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Capture what happened, objections, timing, and anything you want to remember."
          rows={4}
        />

        <Input
          label="Next Move"
          value={nextMove}
          onChange={(e) => setNextMove(e.target.value)}
          placeholder="Follow up Thursday after 2pm, send pricing sheet, drop samples"
        />

        <div>
          <label className="block text-sm text-gray-300 mb-1">Follow-up Date (optional)</label>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="w-full bg-rs-bg border border-rs-border rounded-lg px-3 py-2 text-white text-sm text-left hover:border-rs-gold focus:outline-none"
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
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !summary.trim() && !details.trim()}>
            {submitting ? "Saving..." : "Log Outreach"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DatePicker({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());

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
    <div className="absolute top-full mt-2 bg-rs-surface border border-rs-border rounded-lg p-3 z-50 shadow-lg">
      <div className="flex items-center justify-between mb-3 gap-2">
        <button
          onClick={() => setMonth(m => (m === 0 ? 11 : m - 1))}
          className="px-2 py-1 text-xs text-gray-300 hover:text-white"
        >
          ←
        </button>
        <div className="text-sm font-semibold text-gray-200">
          {monthNames[month]} {year}
        </div>
        <button
          onClick={() => setMonth(m => (m === 11 ? 0 : m + 1))}
          className="px-2 py-1 text-xs text-gray-300 hover:text-white"
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
              key={`${i}-${j}`}
              onClick={() => {
                if (day) {
                  const d = String(day).padStart(2, "0");
                  const m = String(month + 1).padStart(2, "0");
                  onChange(`${year}-${m}-${d}`);
                }
              }}
              className={`w-6 h-6 text-xs rounded ${
                day === null
                  ? ""
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
