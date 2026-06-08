"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AllTabsData, AnyAccount } from "@/types/accounts";
import { EVENT_STATUSES, EventRecord, EventStatus } from "@/types/events";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { EventModal, EventFormData } from "@/components/features/events/EventModal";
import { useSheetStore } from "@/stores/useSheetStore";
import { useUIStore } from "@/stores/useUIStore";
import { getAccountPrimaryId } from "@/lib/accounts/identity";
import { formatDate } from "@/lib/utils/dates";
import {
  getEventStats,
  isBookedRevenueStatus,
  sortEventsByUpcoming,
} from "@/lib/events/helpers";

const STATUS_COLORS: Record<EventStatus, string> = {
  Inquiry: "#8c7fbd",
  Quoted: "#64f5ea",
  Booked: "#44d39f",
  Completed: "#ffb321",
  Cancelled: "#ff7c70",
};

function getAllAccounts(data: AllTabsData): AnyAccount[] {
  return [
    ...data.restaurants,
    ...data.retail,
    ...data.catering,
    ...data.foodTruck,
    ...data.activeAccounts,
  ];
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

type WhenBucket = "Past" | "This Week" | "Next 30 Days" | "Later";
const BUCKET_ORDER: WhenBucket[] = ["This Week", "Next 30 Days", "Later", "Past"];
const BUCKET_ACCENT: Record<WhenBucket, string> = {
  "This Week": "#ffb321",
  "Next 30 Days": "#64f5ea",
  Later: "#a78bfa",
  Past: "#8c7fbd",
};

function bucketForEvent(event: EventRecord): WhenBucket {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${event.event_date}T00:00:00`);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "Past";
  if (diff <= 7) return "This Week";
  if (diff <= 30) return "Next 30 Days";
  return "Later";
}

export default function EventsPage() {
  const { data, fetchAllTabs } = useSheetStore();
  const showActionFeedback = useUIStore((s) => s.showActionFeedback);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [showCreateForAccount, setShowCreateForAccount] = useState<AnyAccount | null>(null);
  const [statusFilter, setStatusFilter] = useState<EventStatus | "all">("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");

  const accounts = useMemo(() => (data ? getAllAccounts(data) : []), [data]);
  const accountsLoaded = Boolean(data);

  async function loadEvents() {
    setLoading(true);
    try {
      const response = await fetch("/api/events", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load events");
      setEvents(await response.json());
    } catch {
      setEvents([]);
      showActionFeedback("Couldn't load events.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  const stats = useMemo(() => getEventStats(events), [events]);

  const filtered = useMemo(() => {
    let list = events;
    if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
    if (accountFilter !== "all") {
      list = list.filter(
        (e) =>
          e.account_id === accountFilter ||
          accounts.find((a) => getAccountPrimaryId(a) === accountFilter)?.account === e.account_name
      );
    }
    return sortEventsByUpcoming(list);
  }, [events, statusFilter, accountFilter, accounts]);

  const findAccount = (event: EventRecord): AnyAccount | undefined => {
    return accounts.find(
      (a) =>
        getAccountPrimaryId(a) === event.account_id ||
        (a.account === event.account_name && a._tabSlug === event.tab_slug)
    );
  };

  async function handleSaveEvent(formData: EventFormData) {
    const target = editingEvent ? findAccount(editingEvent) : showCreateForAccount;
    if (!target) throw new Error("Account not found");

    const isEdit = Boolean(editingEvent);
    const payload = {
      account_id: getAccountPrimaryId(target),
      account_name: target.account,
      tab: target._tab,
      tab_slug: target._tabSlug,
      row_index: target._rowIndex,
      title: formData.title,
      event_date: formData.event_date,
      event_end_date: formData.event_end_date || null,
      location: formData.location || null,
      status: formData.status,
      quoted_amount: formData.quoted_amount,
      actual_amount: formData.actual_amount,
      deposit: formData.deposit,
      deposit_paid: formData.deposit_paid,
      contact_name: formData.contact_name || null,
      phone: formData.phone || null,
      email: formData.email || null,
      notes: formData.notes || null,
    };

    const res = isEdit
      ? await fetch("/api/events", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingEvent!.id, updates: payload }),
        })
      : await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || "Save failed");
    }
    const saved: EventRecord = await res.json();
    setEvents((existing) =>
      isEdit ? existing.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...existing]
    );
    void fetchAllTabs({ silent: true });
    showActionFeedback(isEdit ? "Event updated." : "Event added.", "success");
  }

  async function handleDeleteEvent(eventId: string) {
    try {
      const res = await fetch(`/api/events?id=${encodeURIComponent(eventId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setEvents((existing) => existing.filter((e) => e.id !== eventId));
      showActionFeedback("Event deleted.", "success");
    } catch {
      showActionFeedback("Couldn't delete event.", "error");
    }
  }

  async function handleQuickStatusChange(event: EventRecord, status: EventStatus) {
    try {
      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id, updates: { status } }),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated: EventRecord = await res.json();
      setEvents((existing) => existing.map((e) => (e.id === updated.id ? updated : e)));
    } catch {
      showActionFeedback("Couldn't update status.", "error");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-[#64f5ea]">Bookings</p>
          <h1 className="mt-2 text-3xl font-black text-rs-cream">Events</h1>
          <p className="mt-1 text-sm text-[#af9fe6]">
            Dated bookings tied to accounts. Upcoming events come first.
          </p>
        </div>
        <Button
          onClick={() => setShowCreateForAccount(accounts[0] ?? null)}
          disabled={!accountsLoaded}
          title={!accountsLoaded ? "Loading accounts…" : undefined}
        >
          {accountsLoaded ? "+ Add Event" : "Loading…"}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric
          label="Booked Revenue"
          value={formatMoney(stats.bookedRevenue)}
          sub="Booked + Completed"
          accent="#44d39f"
        />
        <Metric
          label="Forecast"
          value={formatMoney(stats.forecastRevenue)}
          sub="Inquiry + Quoted"
          accent="#64f5ea"
        />
        <Metric
          label="Commission"
          value={formatMoney(stats.totalCommission)}
          sub="10% of revenue"
          accent="#ffb321"
        />
        <Metric
          label="Upcoming"
          value={String(stats.upcomingCount)}
          sub="Future, not completed"
          accent="#a78bfa"
        />
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as EventStatus | "all")}
            options={[
              { value: "all", label: "All statuses" },
              ...EVENT_STATUSES.map((s) => ({ value: s, label: s })),
            ]}
            className="min-w-[160px]"
          />
          <AccountCombobox
            accounts={accounts}
            value={accountFilter}
            onChange={setAccountFilter}
          />
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <EventsList
          events={filtered}
          findAccount={findAccount}
          onEdit={setEditingEvent}
          onStatusChange={handleQuickStatusChange}
          grouped={statusFilter === "all" && accountFilter === "all"}
        />
      )}

      {editingEvent && (
        <EventModal
          accountName={editingEvent.account_name}
          initialEvent={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSubmit={handleSaveEvent}
          onDelete={handleDeleteEvent}
        />
      )}

      {showCreateForAccount && (
        <NewEventAccountPicker
          accounts={accounts}
          selected={showCreateForAccount}
          onPick={setShowCreateForAccount}
          onClose={() => setShowCreateForAccount(null)}
          onSubmit={handleSaveEvent}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  const color = accent ?? "#fff4e8";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-rs-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_50px_rgba(9,4,26,0.35)] backdrop-blur">
      <div
        className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-20 blur-2xl"
        style={{ background: color }}
      />
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#af9fe6]">
          {label}
        </div>
        <div className="mt-2 text-3xl font-black tracking-tight" style={{ color }}>
          {value}
        </div>
        {sub && <div className="mt-1 text-xs text-[#8c7fbd]">{sub}</div>}
      </div>
    </div>
  );
}

function EventsList({
  events,
  findAccount,
  onEdit,
  onStatusChange,
  grouped,
}: {
  events: EventRecord[];
  findAccount: (event: EventRecord) => AnyAccount | undefined;
  onEdit: (event: EventRecord) => void;
  onStatusChange: (event: EventRecord, status: EventStatus) => void;
  grouped: boolean;
}) {
  if (events.length === 0) {
    return (
      <Card className="py-12 text-center">
        <div className="text-2xl">📅</div>
        <div className="mt-2 text-sm text-[#af9fe6]">No events yet.</div>
      </Card>
    );
  }

  if (!grouped) {
    return (
      <EventRows events={events} findAccount={findAccount} onEdit={onEdit} onStatusChange={onStatusChange} />
    );
  }

  const buckets: Record<WhenBucket, EventRecord[]> = {
    "This Week": [],
    "Next 30 Days": [],
    Later: [],
    Past: [],
  };
  for (const event of events) buckets[bucketForEvent(event)].push(event);

  return (
    <div className="space-y-5">
      {BUCKET_ORDER.map((bucket) => {
        const list = buckets[bucket];
        if (list.length === 0) return null;
        const total = list
          .filter((e) => e.status !== "Cancelled")
          .reduce(
            (sum, e) =>
              sum + (isBookedRevenueStatus(e.status) ? (e.actual_amount || e.quoted_amount) : 0),
            0
          );
        const accent = BUCKET_ACCENT[bucket];
        return (
          <div key={bucket} className="space-y-2">
            <div className="flex items-center gap-3">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: accent, boxShadow: `0 0 10px ${accent}99` }}
              />
              <h3
                className="text-[11px] font-bold uppercase tracking-[0.25em]"
                style={{ color: accent }}
              >
                {bucket}
              </h3>
              <span className="text-[10px] text-[#8c7fbd]">
                {list.length}
                {total > 0 ? ` · ${formatMoney(total)} booked` : ""}
              </span>
              <span className="h-px flex-1 bg-rs-border/40" />
            </div>
            <EventRows
              events={list}
              findAccount={findAccount}
              onEdit={onEdit}
              onStatusChange={onStatusChange}
            />
          </div>
        );
      })}
    </div>
  );
}

function EventRows({
  events,
  findAccount,
  onEdit,
  onStatusChange,
}: {
  events: EventRecord[];
  findAccount: (event: EventRecord) => AnyAccount | undefined;
  onEdit: (event: EventRecord) => void;
  onStatusChange: (event: EventRecord, status: EventStatus) => void;
}) {
  return (
    <div className="space-y-2">
      {events.map((event) => {
        const account = findAccount(event);
        const accent = STATUS_COLORS[event.status];
        const amount = event.actual_amount && event.actual_amount > 0
          ? event.actual_amount
          : event.quoted_amount;
        return (
          <div
            key={event.id}
            role="button"
            tabIndex={0}
            onClick={() => onEdit(event)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onEdit(event);
              }
            }}
            className="group relative flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-xl border border-rs-border/60 bg-white/[0.03] p-4 pl-5 text-left transition-all hover:border-rs-gold/40 hover:bg-white/[0.06]"
          >
            <span
              className="absolute left-0 top-0 h-full w-1"
              style={{ background: accent, boxShadow: `0 0 14px ${accent}66` }}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {account ? (
                  <Link
                    href={`/accounts/${account._tabSlug}/${account._rowIndex}`}
                    onClick={(e) => e.stopPropagation()}
                    className="truncate text-base font-bold text-rs-cream hover:text-rs-gold"
                  >
                    {event.account_name}
                  </Link>
                ) : (
                  <div className="truncate text-base font-bold text-rs-cream">
                    {event.account_name}
                  </div>
                )}
              </div>
              <div className="mt-0.5 truncate text-sm text-[#d8ccfb]">{event.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8c7fbd]">
                <span>{formatDate(event.event_date)}</span>
                {event.event_end_date && <span>→ {formatDate(event.event_end_date)}</span>}
                {event.location && (
                  <>
                    <span>·</span>
                    <span className="truncate">{event.location}</span>
                  </>
                )}
                {event.deposit_paid && event.deposit > 0 && (
                  <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200">
                    Deposit {formatMoney(event.deposit)} paid
                  </span>
                )}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className="text-xl font-black tracking-tight text-rs-gold">
                {formatMoney(amount)}
              </div>
              {event.commission > 0 && (
                <div className="text-[10px] text-[#8c7fbd]">
                  {formatMoney(event.commission)} commission
                </div>
              )}
            </div>

            <div className="shrink-0">
              <select
                value={event.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onStatusChange(event, e.target.value as EventStatus)}
                className="appearance-none rounded-full border bg-transparent px-3 py-1 pr-7 text-[11px] font-bold uppercase tracking-wider outline-none"
                style={{
                  borderColor: `${accent}66`,
                  background: `${accent}1f`,
                  color: accent,
                  backgroundImage: `linear-gradient(45deg, transparent 50%, ${accent} 50%), linear-gradient(135deg, ${accent} 50%, transparent 50%)`,
                  backgroundPosition: "calc(100% - 14px) center, calc(100% - 9px) center",
                  backgroundSize: "5px 5px, 5px 5px",
                  backgroundRepeat: "no-repeat",
                }}
              >
                {EVENT_STATUSES.map((s) => (
                  <option key={s} value={s} style={{ background: "#1a0f45", color: "#fff4e8" }}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NewEventAccountPicker({
  accounts,
  selected,
  onPick,
  onClose,
  onSubmit,
}: {
  accounts: AnyAccount[];
  selected: AnyAccount | null;
  onPick: (account: AnyAccount) => void;
  onClose: () => void;
  onSubmit: (data: EventFormData) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts.slice(0, 25);
    return accounts.filter((a) => a.account?.toLowerCase().includes(q)).slice(0, 25);
  }, [accounts, search]);

  if (confirmed && selected) {
    return (
      <EventModal
        accountName={selected.account}
        defaults={{
          location: "location" in selected ? selected.location ?? "" : "",
          contact_name: "contactName" in selected ? selected.contactName ?? "" : "",
          phone: selected.phone ?? "",
          email: selected.email ?? "",
        }}
        onClose={() => {
          setConfirmed(false);
          onClose();
        }}
        onSubmit={onSubmit}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#090414]/75 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-rs-border/80 bg-[linear-gradient(180deg,rgba(26,15,69,0.98),rgba(16,7,38,0.98))] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-rs-cream">Pick an account</h2>
          <button onClick={onClose} className="text-xl leading-none text-[#d8ccfb] hover:text-rs-gold">
            ×
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search accounts..."
          autoFocus
          className="mb-3 w-full rounded-lg border border-rs-border/60 bg-black/30 px-3 py-2 text-sm text-rs-cream outline-none focus:border-rs-cyan/60"
        />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {filtered.map((a) => (
            <button
              key={`${a._tabSlug}_${a._rowIndex}`}
              type="button"
              onClick={() => {
                onPick(a);
                setConfirmed(true);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-rs-border/40 bg-white/5 px-3 py-2 text-left text-sm transition-colors hover:border-rs-gold/50 hover:bg-white/10"
            >
              <span className="min-w-0 truncate text-rs-cream">{a.account}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-[#af9fe6]">
                {a._tab}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-6 text-center text-xs text-[#8c7fbd]">No accounts match.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountCombobox({
  accounts,
  value,
  onChange,
}: {
  accounts: AnyAccount[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedLabel = useMemo(() => {
    if (value === "all") return "All accounts";
    const match = accounts.find((a) => getAccountPrimaryId(a) === value);
    return match?.account ?? value;
  }, [accounts, value]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts.slice(0, 40);
    return accounts.filter((a) => a.account?.toLowerCase().includes(q)).slice(0, 40);
  }, [accounts, query]);

  return (
    <div ref={wrapperRef} className="relative min-w-[200px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-rs-border/60 bg-black/30 px-3 py-2 text-left text-sm text-rs-cream outline-none transition-colors hover:border-rs-cyan/50"
      >
        <span className="truncate">{selectedLabel}</span>
        <span className="text-[10px] text-[#af9fe6]">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[280px] rounded-xl border border-rs-border/80 bg-[linear-gradient(180deg,rgba(26,15,69,0.98),rgba(16,7,38,0.98))] p-2 shadow-2xl">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts…"
            autoFocus
            className="mb-2 w-full rounded-md border border-rs-border/60 bg-black/30 px-2 py-1.5 text-xs text-rs-cream outline-none focus:border-rs-cyan/60"
          />
          <button
            type="button"
            onClick={() => {
              onChange("all");
              setOpen(false);
              setQuery("");
            }}
            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
              value === "all" ? "bg-rs-cyan/15 text-rs-cyan" : "text-rs-cream hover:bg-white/10"
            }`}
          >
            <span>All accounts</span>
            <span className="text-[9px] uppercase tracking-wider text-[#8c7fbd]">{accounts.length}</span>
          </button>
          <div className="mt-1 max-h-64 overflow-y-auto">
            {filtered.map((a) => {
              const id = getAccountPrimaryId(a);
              const active = id === value;
              return (
                <button
                  key={`${a._tabSlug}_${a._rowIndex}`}
                  type="button"
                  onClick={() => {
                    onChange(id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    active ? "bg-rs-cyan/15 text-rs-cyan" : "text-rs-cream hover:bg-white/10"
                  }`}
                >
                  <span className="min-w-0 truncate">{a.account}</span>
                  <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#8c7fbd]">
                    {a._tab}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-center text-[11px] text-[#8c7fbd]">No matches.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
