"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSheetStore } from "@/stores/useSheetStore";
import { useTrashStore, DeletedEntry } from "@/stores/useTrashStore";
import { AnyAccount } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { OrderRecord } from "@/types/orders";
import { formatDateShort, dateToTimestamp, daysSince as utilDaysSince } from "@/lib/utils/dates";
import { Button } from "@/components/ui/Button";
import { SearchBar } from "@/components/ui/SearchBar";
import { countsAsContact } from "@/lib/activity/helpers";
import { getOrderStats } from "@/lib/orders/helpers";
import { useUIStore } from "@/stores/useUIStore";
import { persistActivityEntry } from "@/lib/activity/persist";
import { getAccountPrimaryId } from "@/lib/accounts/identity";
import { encodeOrderDetails } from "@/lib/orders/lineItems";
import { todayISO } from "@/lib/utils/dates";
import { LogOutreachModal } from "@/components/features/dashboard/LogOutreachModal";
import { OrderModal, OrderFormData } from "@/components/features/orders/OrderModal";

type SortBy = "recent" | "oldest" | "name" | "order" | "followup";

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "recent",   label: "Recent Contact" },
  { key: "followup", label: "Follow-Up Due" },
  { key: "order",    label: "Biggest Order" },
  { key: "oldest",   label: "Most Stale" },
  { key: "name",     label: "A → Z" },
];

const STATUS_ACCENT: Record<string, string> = {
  Identified:          "#6f64a8",
  "Reached Out":       "#4d8cff",
  Connected:           "#ffb321",
  "Sample Sent":       "#64f5ea",
  "Tasting Complete":  "#a78bfa",
  "Decision Pending":  "#f97316",
  Backburner:          "#6b7280",
  "Not a Fit":         "#7f1d1d",
  // Legacy
  Researched:          "#4d8cff",
  Contacted:           "#ffb321",
  "Following Up":      "#ff7c70",
  "Closed - Won":      "#44d39f",
  "Not Interested":    "#7f1d1d",
};

function getStatusAccent(status: string | undefined | null): string {
  return STATUS_ACCENT[status || ""] || "#8c7fbd";
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const days = utilDaysSince(dateStr);
  if (!Number.isFinite(days)) return null;
  return days;
}

function followUpTone(date: string | null | undefined): { text: string; tone: "overdue" | "today" | "soon" | "future" | "none" } {
  if (!date) return { text: "—", tone: "none" };
  const target = new Date(`${date}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today.getTime()) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, tone: "overdue" };
  if (diff === 0) return { text: "Today", tone: "today" };
  if (diff <= 3) return { text: `In ${diff}d`, tone: "soon" };
  return { text: formatDateShort(date), tone: "future" };
}

const TONE_CLASSES: Record<"overdue" | "today" | "soon" | "future" | "none", string> = {
  overdue: "border-rs-punch/50 bg-rs-punch/15 text-[#ffd6e8]",
  today:   "border-rs-sunset/50 bg-rs-sunset/15 text-rs-sunset",
  soon:    "border-rs-cyan/40 bg-rs-cyan/10 text-rs-cyan",
  future:  "border-rs-border/60 bg-white/5 text-[#d8ccfb]",
  none:    "border-rs-border/40 bg-transparent text-[#8c7fbd]",
};

function accountInitials(name: string): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm font-bold"
      style={{ background: `${color}22`, borderColor: `${color}55`, color }}
    >
      {accountInitials(name)}
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
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#af9fe6]">{label}</div>
        <div className="mt-2 text-3xl font-black tracking-tight" style={{ color }}>
          {value}
        </div>
        {sub && <div className="mt-1 text-xs text-[#8c7fbd]">{sub}</div>}
      </div>
    </div>
  );
}

function ActiveAccountsPageContent() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<AnyAccount[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("followup");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [staleness, setStaleness] = useState<"all" | "14" | "30">("all");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [outreachTarget, setOutreachTarget] = useState<AnyAccount | null>(null);
  const [orderTarget, setOrderTarget] = useState<AnyAccount | null>(null);
  const { data, fetchAllTabs } = useSheetStore();
  const { entries: trash, removeFromTrash, clearTrash } = useTrashStore();
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);
  const showActionFeedbackWithAction = useUIStore((state) => state.showActionFeedbackWithAction);
  const deleteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const focus = searchParams.get("focus") ?? "";

  useEffect(() => {
    const requested = searchParams.get("sort");
    if (requested && SORT_OPTIONS.some((o) => o.key === requested)) {
      setSortBy(requested as SortBy);
    }
  }, [searchParams]);

  useEffect(() => {
    if (data?.activeAccounts) setAccounts(data.activeAccounts);
  }, [data]);

  useEffect(() => {
    async function loadSupportingData() {
      try {
        const [activityResponse, ordersResponse] = await Promise.all([
          fetch("/api/activity", { cache: "no-store" }),
          fetch("/api/orders", { cache: "no-store" }),
        ]);
        if (activityResponse.ok) setLogs(await activityResponse.json());
        if (ordersResponse.ok) setOrders(await ordersResponse.json());
      } catch {
        setLogs([]);
        setOrders([]);
      }
    }
    void loadSupportingData();
  }, []);

  const finalizeDelete = async (account: AnyAccount, entry: DeletedEntry) => {
    const accountId = `${account._tabSlug}_${account._rowIndex}`;
    try {
      const response = await fetch("/api/sheets/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tab: "Active Accounts",
          rowIndex: account._rowIndex,
          deleteRow: true,
          expectedValues: { accountName: account.account },
        }),
      });
      if (response.status === 409) throw new Error("conflict");
      if (!response.ok) throw new Error("delete failed");
      removeFromTrash(entry.id);
      setPendingDeleteIds((existing) => existing.filter((id) => id !== accountId));
      await fetchAllTabs();
      showActionFeedback(`${account.account} deleted.`, "success");
    } catch {
      removeFromTrash(entry.id);
      setPendingDeleteIds((existing) => existing.filter((id) => id !== accountId));
      showActionFeedback(`Couldn't delete ${account.account}. Row likely changed.`, "error");
      await fetchAllTabs();
    } finally {
      delete deleteTimers.current[entry.id];
    }
  };

  const undoDelete = (entryId: string, accountId: string) => {
    const timer = deleteTimers.current[entryId];
    if (timer) {
      window.clearTimeout(timer);
      delete deleteTimers.current[entryId];
    }
    removeFromTrash(entryId);
    setPendingDeleteIds((existing) => existing.filter((id) => id !== accountId));
    showActionFeedback("Delete undone.", "success");
  };

  const handleDelete = async (account: AnyAccount) => {
    const accountId = `${account._tabSlug}_${account._rowIndex}`;
    const entry: DeletedEntry = {
      id: accountId,
      account_id: accountId,
      account_name: account.account,
      tab: "Active Accounts",
      action_type: "delete",
      note: `Deleted account: ${account.account}`,
      deleted_at: new Date().toISOString(),
    };
    useTrashStore.getState().addToTrash(entry);
    setPendingDeleteIds((existing) => [...existing, accountId]);
    deleteTimers.current[entry.id] = setTimeout(() => {
      void finalizeDelete(account, entry);
    }, 5000);
    showActionFeedbackWithAction(
      `${account.account} will be deleted in a few seconds.`,
      "Undo",
      () => undoDelete(entry.id, accountId),
      "info"
    );
  };

  const handleRestore = (entry: DeletedEntry) => {
    undoDelete(entry.id, entry.account_id);
  };

  const refreshActivity = async () => {
    try {
      const res = await fetch("/api/activity", { cache: "no-store" });
      if (res.ok) setLogs(await res.json());
    } catch {}
  };

  const refreshOrders = async () => {
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      if (res.ok) setOrders(await res.json());
    } catch {}
  };

  const handleQuickOutreach = async (
    account: AnyAccount,
    data: { actionType: string; statusAfter: string; note: string; followUpDate: string; nextActionType: string }
  ) => {
    try {
      await persistActivityEntry({
        account,
        actionType: data.actionType,
        note: data.note,
        followUpDate: data.followUpDate || null,
        statusBefore: account.status,
        statusAfter: data.statusAfter || account.status || null,
        source: "manual",
        activityKind: data.actionType === "note" ? "note" : "outreach",
        countsAsContact: data.actionType !== "note",
        nextActionType: data.nextActionType || null,
      });
      // Push status + next steps back to the sheet so the row stays in sync.
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
      }).catch(() => {});
      setOutreachTarget(null);
      await Promise.all([refreshActivity(), fetchAllTabs()]);
      showActionFeedback(`Logged outreach for ${account.account}.`, "success");
    } catch {
      showActionFeedback("Couldn't save outreach entry.", "error");
    }
  };

  const handleQuickOrder = async (account: AnyAccount, data: OrderFormData) => {
    const accountId = getAccountPrimaryId(account);
    const encodedDetails = encodeOrderDetails(data.lineItems, data.freeTextDetails);
    const amount = Number.isFinite(data.amount) ? data.amount : 0;
    const payload = {
      account_id: accountId,
      account_name: account.account,
      tab: account._tabSlug,
      row_index: account._rowIndex,
      account_type: account.type,
      contact_name: account.contactName,
      phone: account.phone,
      email: account.email,
      order_name: data.orderName,
      order_date: data.orderDate,
      due_date: data.dueDate || null,
      fulfillment_date: data.fulfillmentDate || null,
      status: data.status,
      priority: data.priority,
      owner: data.owner || null,
      details: encodedDetails || null,
      production_notes: data.productionNotes || null,
      amount,
      notes: data.productionNotes || null,
    };
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      showActionFeedback("Couldn't log order.", "error");
      throw new Error("Save failed");
    }
    setOrderTarget(null);
    await Promise.all([refreshOrders(), fetchAllTabs()]);
    showActionFeedback(`Order logged for ${account.account}.`, "success");
  };

  const latestContactByAccount = useMemo(() => {
    const map: Record<string, ActivityLog | null> = {};
    const sorted = [...logs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    for (const log of sorted) {
      if (!countsAsContact(log)) continue;
      if (!map[log.account_id]) map[log.account_id] = log;
    }
    return map;
  }, [logs]);

  const nextFollowUpByAccount = useMemo(() => {
    const map: Record<string, string> = {};
    const sorted = [...logs].sort(
      (a, b) =>
        new Date(a.follow_up_date || "9999-12-31").getTime() -
        new Date(b.follow_up_date || "9999-12-31").getTime()
    );
    for (const log of sorted) {
      if (!log.follow_up_date) continue;
      if (!map[log.account_id]) map[log.account_id] = log.follow_up_date;
    }
    return map;
  }, [logs]);

  const ordersByAccount = useMemo(() => {
    const map: Record<string, OrderRecord[]> = {};
    for (const order of orders) {
      map[order.account_id] = [...(map[order.account_id] ?? []), order];
    }
    return map;
  }, [orders]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    accounts.forEach((a) => {
      const s = a.status || "—";
      c[s] = (c[s] || 0) + 1;
    });
    return c;
  }, [accounts]);

  const visibleAccounts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const filtered = accounts.filter((account) => {
      const accountId = `${account._tabSlug}_${account._rowIndex}`;
      if (pendingDeleteIds.includes(accountId)) return false;
      if (statusFilter && account.status !== statusFilter) return false;
      if (!normalized) return true;
      return [
        account.account,
        account.contactName,
        account.email,
        account.phone,
        account.nextSteps,
        "order" in account ? account.order : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });

    const focusFiltered = filtered.filter((account) => {
      const accountId = `${account._tabSlug}_${account._rowIndex}`;

      if (staleness !== "all") {
        const last = latestContactByAccount[accountId]?.created_at || account.contactDate;
        const since = daysSince(last);
        const threshold = staleness === "14" ? 14 : 30;
        if (since === null || since < threshold) return false;
      }

      if (!focus) return true;
      const followUpDate = nextFollowUpByAccount[accountId];
      const parsed = followUpDate ? new Date(followUpDate) : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (focus === "overdue-followup") return Boolean(parsed && parsed.getTime() < today.getTime());
      if (focus === "today-followup") return Boolean(parsed && parsed.getTime() === today.getTime());
      if (focus === "upcoming-followup") return Boolean(parsed && parsed.getTime() > today.getTime());
      if (focus === "buyers") return (ordersByAccount[accountId]?.length ?? 0) > 0;
      return true;
    });

    return [...focusFiltered].sort((a, b) => {
      const idA = `${a._tabSlug}_${a._rowIndex}`;
      const idB = `${b._tabSlug}_${b._rowIndex}`;
      if (sortBy === "name") return a.account.localeCompare(b.account);
      if (sortBy === "oldest") {
        const aDate = latestContactByAccount[idA]?.created_at || a.contactDate;
        const bDate = latestContactByAccount[idB]?.created_at || b.contactDate;
        return dateToTimestamp(aDate) - dateToTimestamp(bDate);
      }
      if (sortBy === "order") {
        const aValue = parseFloat(("order" in a ? a.order : "").replace(/[^0-9.]/g, "")) || 0;
        const bValue = parseFloat(("order" in b ? b.order : "").replace(/[^0-9.]/g, "")) || 0;
        return bValue - aValue;
      }
      if (sortBy === "followup") {
        const aDate = nextFollowUpByAccount[idA] || "9999-12-31";
        const bDate = nextFollowUpByAccount[idB] || "9999-12-31";
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      }
      const aDate = latestContactByAccount[idA]?.created_at || a.contactDate;
      const bDate = latestContactByAccount[idB]?.created_at || b.contactDate;
      return dateToTimestamp(bDate) - dateToTimestamp(aDate);
    });
  }, [accounts, focus, latestContactByAccount, nextFollowUpByAccount, ordersByAccount, pendingDeleteIds, search, sortBy, statusFilter, staleness]);

  const lifetimeTotal = useMemo(
    () => orders.reduce((sum, o) => sum + (Number.isFinite(o.amount) ? o.amount : 0), 0),
    [orders]
  );

  const followUpDueCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Object.values(nextFollowUpByAccount).filter((d) => {
      const t = new Date(`${d}T00:00:00`).getTime();
      return t <= today.getTime();
    }).length;
  }, [nextFollowUpByAccount]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-rs-cyan">Customer Roster</p>
          <h1 className="mt-2 text-3xl font-black text-rs-cream">Active Accounts</h1>
        </div>
        {trash.length > 0 && (
          <Button
            onClick={() => setShowTrash(!showTrash)}
            variant={showTrash ? "primary" : "secondary"}
          >
            Trash ({trash.length})
          </Button>
        )}
      </div>

      {showTrash ? (
        <div className="rounded-2xl border border-rs-punch/40 bg-rs-surface/60 p-6">
          <h2 className="text-xl font-bold text-rs-gold mb-4">Deleted Items</h2>
          {trash.length === 0 ? (
            <p className="text-gray-400">No deleted items</p>
          ) : (
            <div className="space-y-2">
              {trash.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg bg-rs-bg/60 p-3"
                >
                  <div>
                    <p className="font-medium text-white">{entry.account_name}</p>
                    <p className="text-sm text-gray-400">Deleted {formatDateShort(entry.deleted_at)}</p>
                  </div>
                  <Button onClick={() => handleRestore(entry)} variant="secondary" className="text-sm">
                    Restore
                  </Button>
                </div>
              ))}
              <Button
                onClick={clearTrash}
                variant="secondary"
                className="w-full mt-4 text-red-400 hover:text-red-300"
              >
                Empty Trash
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Active Deals" value={String(visibleAccounts.length)} sub={`of ${accounts.length} total`} accent="#64f5ea" />
            <Metric
              label="Follow-Ups Due"
              value={String(followUpDueCount)}
              sub={followUpDueCount ? "Today or overdue" : "All clear"}
              accent={followUpDueCount ? "#ff4f9f" : "#8c7fbd"}
            />
            <Metric
              label="Orders Logged"
              value={String(orders.length)}
              sub={orders.length ? "All time" : "No orders yet"}
              accent="#a78bfa"
            />
            <Metric
              label="Lifetime Revenue"
              value={`$${lifetimeTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
              sub="All accounts combined"
              accent="#ffb321"
            />
          </div>

          {focus && (
            <div className="rounded-2xl border border-rs-gold/30 bg-rs-gold/10 px-4 py-3 text-sm text-rs-cream">
              Focus filter active: <span className="font-semibold">{focus.replace(/-/g, " ")}</span>
            </div>
          )}

          {/* Filter rail */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex-1">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search account, contact, email, phone, next step"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-rs-border/70 bg-black/20 p-0.5">
              {SORT_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortBy(key)}
                  className={`rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                    sortBy === key
                      ? "bg-rs-cyan/20 text-rs-cyan"
                      : "text-[#af9fe6] hover:text-rs-cream"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Staleness chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#8c7fbd]">Last touched</span>
            {([
              { key: "all", label: "Any" },
              { key: "14", label: ">14d cold" },
              { key: "30", label: ">30d cold" },
            ] as const).map(({ key, label }) => {
              const active = staleness === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStaleness(key)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                    active
                      ? "border-rs-punch/60 bg-rs-punch/15 text-rs-punch"
                      : "border-rs-border/60 bg-white/5 text-[#af9fe6] hover:text-rs-cream"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Status chips */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("")}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                statusFilter === ""
                  ? "border-rs-cyan/60 bg-rs-cyan/15 text-rs-cyan"
                  : "border-rs-border/60 bg-white/5 text-[#af9fe6] hover:border-rs-cyan/40 hover:text-rs-cream"
              }`}
            >
              All · {accounts.length}
            </button>
            {Object.entries(statusCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => {
                const accent = getStatusAccent(status);
                const active = statusFilter === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(active ? "" : status)}
                    className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors"
                    style={{
                      borderColor: active ? `${accent}99` : "rgba(73,48,140,0.5)",
                      background: active ? `${accent}22` : "rgba(255,255,255,0.04)",
                      color: active ? accent : "#af9fe6",
                    }}
                  >
                    {status} · {count}
                  </button>
                );
              })}
          </div>

          {/* Account rows */}
          {visibleAccounts.length === 0 ? (
            <div className="rounded-2xl border border-rs-border/60 bg-white/[0.03] py-16 text-center">
              <div className="text-2xl">🦝</div>
              <div className="mt-2 text-sm text-[#af9fe6]">No accounts match these filters.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleAccounts.map((account) => {
                const accountId = `${account._tabSlug}_${account._rowIndex}`;
                const latestContact = latestContactByAccount[accountId];
                const followUpDate = nextFollowUpByAccount[accountId];
                const followUp = followUpTone(followUpDate);
                const stats = getOrderStats(ordersByAccount[accountId] ?? []);
                const displayLastContact = latestContact?.created_at || account.contactDate;
                const since = daysSince(displayLastContact);
                const accent = getStatusAccent(account.status);
                const sheetOrderRaw = ("order" in account ? account.order : "") || "";
                const lastOrderAmount =
                  stats.latest?.amount ??
                  (parseFloat(sheetOrderRaw.replace(/[^0-9.]/g, "")) || 0);

                return (
                  <div
                    key={accountId}
                    className="group relative flex items-center gap-4 overflow-hidden rounded-xl border border-rs-border/60 bg-white/[0.03] p-4 pl-5 transition-all hover:border-rs-gold/40 hover:bg-white/[0.06]"
                  >
                    {/* Status colored bar */}
                    <span
                      className="absolute left-0 top-0 h-full w-1"
                      style={{ background: accent, boxShadow: `0 0 14px ${accent}66` }}
                    />

                    <Avatar name={account.account} color={accent} />

                    {/* Account name + status + contact */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/accounts/${account._tabSlug}/${account._rowIndex}`}
                          className="truncate text-base font-bold text-rs-cream hover:text-rs-gold"
                        >
                          {account.account}
                        </Link>
                        <span
                          className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            borderColor: `${accent}66`,
                            background: `${accent}1f`,
                            color: accent,
                          }}
                        >
                          {account.status || "—"}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-sm text-[#d8ccfb]">
                        {account.contactName || "No contact on file"}
                        {account.phone && <span className="text-[#8c7fbd]"> · {account.phone}</span>}
                      </div>
                      {account.nextSteps && (
                        <div className="mt-1 truncate text-xs text-[#8c7fbd]">
                          Next: {account.nextSteps}
                        </div>
                      )}
                    </div>

                    {/* Last contact */}
                    <div className="hidden shrink-0 text-right md:block">
                      <div className="text-[10px] uppercase tracking-wider text-[#8c7fbd]">Last Contact</div>
                      <div className="text-sm font-semibold text-rs-cream">
                        {displayLastContact ? formatDateShort(displayLastContact) : "—"}
                      </div>
                      {since !== null && (
                        <div className={`text-[10px] ${since > 14 ? "text-rs-punch" : since > 7 ? "text-rs-sunset" : "text-[#8c7fbd]"}`}>
                          {since}d ago
                        </div>
                      )}
                    </div>

                    {/* Follow-up chip */}
                    <div className="hidden shrink-0 sm:block">
                      <div className="text-[10px] uppercase tracking-wider text-[#8c7fbd] mb-1 text-center">Follow-Up</div>
                      <span
                        className={`inline-block rounded-full border px-3 py-1 text-[11px] font-semibold ${TONE_CLASSES[followUp.tone]}`}
                      >
                        {followUp.text}
                      </span>
                    </div>

                    {/* Orders summary */}
                    <div className="hidden shrink-0 text-right lg:block">
                      <div className="text-[10px] uppercase tracking-wider text-[#8c7fbd]">
                        {stats.count > 0 ? `${stats.count} order${stats.count === 1 ? "" : "s"}` : "Last order"}
                      </div>
                      <div className="text-xl font-black tracking-tight text-rs-gold">
                        ${lastOrderAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </div>
                      {stats.count > 1 && (
                        <div className="text-[10px] text-[#8c7fbd]">
                          ${stats.total.toLocaleString("en-US", { maximumFractionDigits: 0 })} lifetime
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setOutreachTarget(account)}
                        className="rounded-lg border border-rs-gold/40 bg-rs-gold/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-rs-gold transition-colors hover:bg-rs-gold/20"
                      >
                        Log
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderTarget(account)}
                        className="rounded-lg border border-rs-sunset/40 bg-rs-sunset/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-rs-sunset transition-colors hover:bg-rs-sunset/20"
                      >
                        Order
                      </button>
                      <Link
                        href={`/accounts/${account._tabSlug}/${account._rowIndex}`}
                        className="rounded-lg border border-rs-cyan/40 bg-rs-cyan/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-rs-cyan transition-colors hover:bg-rs-cyan/20"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(account)}
                        className="rounded-lg px-2 py-1.5 text-[11px] text-[#8c7fbd] opacity-0 transition-opacity hover:text-rs-punch group-hover:opacity-100"
                        aria-label={`Delete ${account.account}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {outreachTarget && (
        <LogOutreachModal
          account={outreachTarget}
          onClose={() => setOutreachTarget(null)}
          onSubmit={(data) => handleQuickOutreach(outreachTarget, data)}
        />
      )}

      {orderTarget && (
        <OrderModal
          accountName={orderTarget.account}
          onClose={() => setOrderTarget(null)}
          onSubmit={(data) => handleQuickOrder(orderTarget, data)}
        />
      )}
    </div>
  );
}

export default function ActiveAccountsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">Loading active accounts...</div>}>
      <ActiveAccountsPageContent />
    </Suspense>
  );
}
