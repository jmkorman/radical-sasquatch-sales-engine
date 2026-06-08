"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { DateField } from "@/components/ui/DatePicker";
import { EVENT_STATUSES, EventRecord, EventStatus } from "@/types/events";
import { calculateEventCommission } from "@/lib/events/helpers";
import { todayISO } from "@/lib/utils/dates";

export interface EventFormData {
  title: string;
  event_date: string;
  event_end_date: string;
  location: string;
  status: EventStatus;
  quoted_amount: number;
  actual_amount: number | null;
  deposit: number;
  deposit_paid: boolean;
  contact_name: string;
  phone: string;
  email: string;
  notes: string;
}

interface EventModalProps {
  /** Account display name — purely for the modal title. */
  accountName: string;
  /** Existing event to edit, or null/undefined for a new event */
  initialEvent?: EventRecord | null;
  onClose: () => void;
  onSubmit: (data: EventFormData) => Promise<void>;
  /** When provided on an edit, shows a Delete button. */
  onDelete?: (eventId: string) => Promise<void>;
  /** Optional defaults (e.g. prefill location/contact from the account). */
  defaults?: Partial<EventFormData>;
}

function fromRecord(
  record: EventRecord | null | undefined,
  defaults?: Partial<EventFormData>
): EventFormData {
  if (!record) {
    return {
      title: defaults?.title ?? "",
      event_date: defaults?.event_date ?? todayISO(),
      event_end_date: defaults?.event_end_date ?? "",
      location: defaults?.location ?? "",
      status: defaults?.status ?? "Inquiry",
      quoted_amount: defaults?.quoted_amount ?? 0,
      actual_amount: defaults?.actual_amount ?? null,
      deposit: defaults?.deposit ?? 0,
      deposit_paid: defaults?.deposit_paid ?? false,
      contact_name: defaults?.contact_name ?? "",
      phone: defaults?.phone ?? "",
      email: defaults?.email ?? "",
      notes: defaults?.notes ?? "",
    };
  }
  return {
    title: record.title ?? "",
    event_date: record.event_date ?? todayISO(),
    event_end_date: record.event_end_date ?? "",
    location: record.location ?? "",
    status: record.status,
    quoted_amount: record.quoted_amount ?? 0,
    actual_amount: record.actual_amount ?? null,
    deposit: record.deposit ?? 0,
    deposit_paid: Boolean(record.deposit_paid),
    contact_name: record.contact_name ?? "",
    phone: record.phone ?? "",
    email: record.email ?? "",
    notes: record.notes ?? "",
  };
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function EventModal({
  accountName,
  initialEvent,
  onClose,
  onSubmit,
  onDelete,
  defaults,
}: EventModalProps) {
  const [form, setForm] = useState<EventFormData>(() => fromRecord(initialEvent, defaults));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(initialEvent);

  const commissionPreview = calculateEventCommission({
    quoted_amount: form.quoted_amount,
    actual_amount: form.actual_amount,
    status: form.status,
  });

  function patch<K extends keyof EventFormData>(key: K, value: EventFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!form.event_date) {
      setError("Event date is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialEvent || !onDelete) return;
    if (!window.confirm("Delete this event? This cannot be undone.")) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(initialEvent.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`${isEdit ? "Edit Event" : "Add Event"} — ${accountName}`}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        <Input
          label="Title"
          value={form.title}
          onChange={(e) => patch("title", e.target.value)}
          placeholder="Aurora Sports Park Summer Fest"
          autoFocus
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <DateField
            label="Event Date"
            value={form.event_date}
            onChange={(v) => patch("event_date", v)}
          />
          <DateField
            label="End Date"
            value={form.event_end_date}
            onChange={(v) => patch("event_end_date", v)}
            optional
          />
        </div>

        <Input
          label="Location"
          value={form.location}
          onChange={(e) => patch("location", e.target.value)}
          placeholder="Venue address or site (may differ from the account)"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => patch("status", e.target.value as EventStatus)}
            options={EVENT_STATUSES.map((s) => ({ value: s, label: s }))}
          />
          <div>
            <label className="mb-1 block text-sm text-gray-300">Deposit Paid</label>
            <button
              type="button"
              onClick={() => patch("deposit_paid", !form.deposit_paid)}
              className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors ${
                form.deposit_paid
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                  : "border-rs-border bg-rs-bg text-white hover:border-rs-gold"
              }`}
            >
              {form.deposit_paid ? "Yes — paid" : "No"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Quoted Amount"
            type="number"
            inputMode="decimal"
            value={form.quoted_amount || ""}
            onChange={(e) => patch("quoted_amount", parseFloat(e.target.value) || 0)}
            placeholder="0"
          />
          <Input
            label="Actual Amount"
            type="number"
            inputMode="decimal"
            value={form.actual_amount ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              patch("actual_amount", raw === "" ? null : parseFloat(raw) || 0);
            }}
            placeholder="After the event"
          />
          <Input
            label="Deposit"
            type="number"
            inputMode="decimal"
            value={form.deposit || ""}
            onChange={(e) => patch("deposit", parseFloat(e.target.value) || 0)}
            placeholder="0"
          />
        </div>

        <div className="rounded-lg border border-rs-border/60 bg-black/20 px-3 py-2 text-xs text-[#d8ccfb]">
          <span className="text-[#af9fe6]">Estimated commission (10%):</span>{" "}
          <span className="font-bold text-rs-gold">{formatMoney(commissionPreview)}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Contact Name"
            value={form.contact_name}
            onChange={(e) => patch("contact_name", e.target.value)}
            placeholder="Event point of contact"
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => patch("phone", e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => patch("email", e.target.value)}
          />
        </div>

        <Textarea
          label="Notes"
          value={form.notes}
          onChange={(e) => patch("notes", e.target.value)}
          placeholder="Headcount, menu, logistics, deposit terms…"
          rows={4}
        />

        {error && (
          <div className="rounded-lg border border-rs-punch/40 bg-rs-punch/10 px-3 py-2 text-sm text-[#ffd6e8]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div>
            {isEdit && onDelete && (
              <Button
                variant="secondary"
                onClick={handleDelete}
                disabled={saving}
                className="border-rs-punch/40 bg-rs-punch/10 text-[#ffd6e8] hover:border-rs-punch hover:text-[#ffd6e8]"
              >
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Event"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
