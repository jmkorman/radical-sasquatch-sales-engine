"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AllTabsData, AnyAccount } from "@/types/accounts";
import { OrderRecord, ORDER_STATUSES, OrderStatus } from "@/types/orders";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { OrderModal, OrderFormData } from "@/components/features/orders/OrderModal";
import { useSheetStore } from "@/stores/useSheetStore";
import { useUIStore } from "@/stores/useUIStore";
import { getAccountPrimaryId } from "@/lib/accounts/identity";
import { formatDate } from "@/lib/utils/dates";
import {
  encodeOrderDetails,
  parseOrderDetails,
  summarizeLineItems,
} from "@/lib/orders/lineItems";

const STATUS_COLORS: Record<OrderStatus, string> = {
  New: "#64f5ea",
  Confirmed: "#4d8cff",
  "In Production": "#ffb321",
  Ready: "#44d39f",
  Delivered: "#8c7fbd",
  "Invoiced/Paid": "#fff4e8",
  Canceled: "#ff7c70",
};

type ViewMode = "active" | "board" | "all";
type SortKey = "due" | "amount" | "newest";

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

function dueLabel(order: OrderRecord): { text: string; tone: "overdue" | "today" | "soon" | "future" | "none" } {
  const target = order.fulfillment_date || order.due_date;
  if (!target) return { text: "—", tone: "none" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${target}T00:00:00`);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, tone: "overdue" };
  if (diff === 0) return { text: "Due today", tone: "today" };
  if (diff <= 3) return { text: `Due in ${diff}d`, tone: "soon" };
  return { text: formatDate(target), tone: "future" };
}

const TONE_CLASSES: Record<ReturnType<typeof dueLabel>["tone"], string> = {
  overdue: "border-rs-punch/50 bg-rs-punch/15 text-[#ffd6e8]",
  today: "border-rs-sunset/50 bg-rs-sunset/15 text-rs-sunset",
  soon: "border-rs-cyan/40 bg-rs-cyan/10 text-rs-cyan",
  future: "border-rs-border/60 bg-white/5 text-[#d8ccfb]",
  none: "border-rs-border/40 bg-white/0 text-[#8c7fbd]",
};

export default function OrdersPage() {
  const { data, fetchAllTabs } = useSheetStore();
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOrder, setEditingOrder] = useState<OrderRecord | null>(null);
  const [showCreateForAccount, setShowCreateForAccount] = useState<AnyAccount | null>(null);
  const [view, setView] = useState<ViewMode>("active");
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");

  const accounts = useMemo(() => (data ? getAllAccounts(data) : []), [data]);
  const accountsLoaded = Boolean(data);

  async function loadOrders() {
    setLoading(true);
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load orders");
      setOrders(await response.json());
    } catch {
      setOrders([]);
      showActionFeedback("Couldn't load orders.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  const handleDuplicateOrder = async (order: OrderRecord) => {
    const target = findAccount(order);
    if (!target) {
      showActionFeedback("Couldn't find that account to duplicate the order.", "error");
      return;
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    const payload = {
      account_id: getAccountPrimaryId(target),
      account_name: target.account,
      tab: target._tabSlug,
      row_index: target._rowIndex,
      account_type: target.type,
      contact_name: target.contactName,
      phone: target.phone,
      email: target.email,
      order_name: order.order_name ? `${order.order_name} (copy)` : "Repeat order",
      order_date: todayIso,
      due_date: null,
      fulfillment_date: null,
      status: "New",
      priority: order.priority || "Normal",
      owner: order.owner || null,
      details: order.details || null,
      production_notes: order.production_notes || null,
      amount: order.amount || 0,
      notes: order.production_notes || null,
    };
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("duplicate failed");
      const saved: OrderRecord = await res.json();
      setOrders((existing) => [saved, ...existing]);
      setEditingOrder(saved);
      showActionFeedback("Order duplicated — review the copy.", "success");
    } catch {
      showActionFeedback("Couldn't duplicate that order.", "error");
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders?id=${encodeURIComponent(orderId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setOrders((existing) => existing.filter((o) => o.id !== orderId));
      showActionFeedback("Order deleted.", "success");
    } catch {
      showActionFeedback("Couldn't delete order.", "error");
    }
  };

  // Stats
  const totals = useMemo(() => {
    const active = orders.filter((o) => o.status !== "Canceled" && o.status !== "Delivered" && o.status !== "Invoiced/Paid");
    const activeRevenue = active.reduce((sum, o) => sum + (o.amount || 0), 0);
    const inProduction = orders.filter((o) => o.status === "In Production");
    const ready = orders.filter((o) => o.status === "Ready");
    const overdue = orders.filter((o) => {
      const target = o.fulfillment_date || o.due_date;
      if (!target) return false;
      if (o.status === "Delivered" || o.status === "Invoiced/Paid" || o.status === "Canceled") return false;
      return new Date(`${target}T23:59:59`).getTime() < Date.now();
    });
    return { active, activeRevenue, inProduction, ready, overdue };
  }, [orders]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = orders;
    if (view === "active") {
      list = list.filter((o) => o.status !== "Canceled" && o.status !== "Delivered" && o.status !== "Invoiced/Paid");
    }
    if (statusFilter !== "all") list = list.filter((o) => o.status === statusFilter);
    if (accountFilter !== "all") list = list.filter((o) => o.account_id === accountFilter || o.account_name === accountFilter);

    if (sortKey === "amount") {
      list = [...list].sort((a, b) => (b.amount || 0) - (a.amount || 0));
    } else if (sortKey === "newest") {
      list = [...list].sort(
        (a, b) =>
          new Date(b.created_at || b.order_date).getTime() -
          new Date(a.created_at || a.order_date).getTime()
      );
    } else {
      // due
      list = [...list].sort((a, b) => {
        const aDate = a.fulfillment_date || a.due_date || a.order_date;
        const bDate = b.fulfillment_date || b.due_date || b.order_date;
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      });
    }

    return list;
  }, [orders, view, statusFilter, accountFilter, sortKey]);

  // Board view groups by status
  const ordersByStatus = useMemo(() => {
    const map: Record<OrderStatus, OrderRecord[]> = {
      New: [],
      Confirmed: [],
      "In Production": [],
      Ready: [],
      Delivered: [],
      "Invoiced/Paid": [],
      Canceled: [],
    };
    for (const order of orders) map[order.status]?.push(order);
    for (const status of ORDER_STATUSES) {
      map[status].sort((a, b) => {
        const aDate = a.fulfillment_date || a.due_date || a.order_date || a.created_at;
        const bDate = b.fulfillment_date || b.due_date || b.order_date || b.created_at;
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      });
    }
    return map;
  }, [orders]);

  const findAccount = (order: OrderRecord): AnyAccount | undefined => {
    return accounts.find(
      (a) =>
        getAccountPrimaryId(a) === order.account_id ||
        (a.account === order.account_name && a._tabSlug === order.tab)
    );
  };

  const handleSaveOrder = async (data: OrderFormData) => {
    const account = editingOrder ? findAccount(editingOrder) : showCreateForAccount;
    if (!account && !editingOrder) {
      throw new Error("No account selected");
    }
    const target = account ?? findAccount(editingOrder!);
    if (!target) throw new Error("Account not found");

    const encodedDetails = encodeOrderDetails(data.lineItems, data.freeTextDetails);
    const amount = Number.isFinite(data.amount) ? data.amount : 0;
    const isEdit = Boolean(editingOrder);

    const payload = {
      account_id: getAccountPrimaryId(target),
      account_name: target.account,
      tab: target._tabSlug,
      row_index: target._rowIndex,
      account_type: target.type,
      contact_name: target.contactName,
      phone: target.phone,
      email: target.email,
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

    const res = isEdit
      ? await fetch("/api/orders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingOrder!.id, ...payload }),
        })
      : await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || "Save failed");
    }
    const saved: OrderRecord = await res.json();
    setOrders((existing) =>
      isEdit ? existing.map((o) => (o.id === saved.id ? saved : o)) : [saved, ...existing]
    );
    void fetchAllTabs({ silent: true });
    showActionFeedback(isEdit ? "Order updated." : "Order created.", "success");
  };

  const handleQuickStatusChange = async (order: OrderRecord, status: OrderStatus) => {
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, updates: { status } }),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated: OrderRecord = await res.json();
      setOrders((existing) => existing.map((o) => (o.id === updated.id ? updated : o)));
    } catch {
      showActionFeedback("Couldn't update status.", "error");
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-[#64f5ea]">Production Bridge</p>
          <h1 className="mt-2 text-3xl font-black text-rs-cream">Orders</h1>
        </div>
        <Button
          onClick={() => setShowCreateForAccount(accounts[0] ?? null)}
          disabled={!accountsLoaded}
          title={!accountsLoaded ? "Loading accounts…" : undefined}
        >
          {accountsLoaded ? "+ New Order" : "Loading…"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-4">
        <Metric
          label="Open Pipeline"
          value={formatMoney(totals.activeRevenue)}
          sub={`${totals.active.length} active`}
          accent="#64f5ea"
        />
        <Metric label="In Production" value={String(totals.inProduction.length)} sub="Active builds" accent="#ffb321" />
        <Metric label="Ready" value={String(totals.ready.length)} sub="Awaiting delivery" accent="#44d39f" />
        <Metric
          label="Overdue"
          value={String(totals.overdue.length)}
          sub={totals.overdue.length ? "Past due date" : "On track"}
          accent={totals.overdue.length ? "#ff4f9f" : "#8c7fbd"}
        />
      </div>

      {/* View / filters */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-rs-border/70 bg-black/20 p-0.5">
            {([
              { key: "active", label: "Active" },
              { key: "all", label: "All" },
              { key: "board", label: "Board" },
            ] as { key: ViewMode; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  view === key
                    ? "bg-rs-gold text-rs-bg"
                    : "text-[#af9fe6] hover:text-rs-cream"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {view !== "board" && (
            <>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "all")}
                options={[
                  { value: "all", label: "All statuses" },
                  ...ORDER_STATUSES.map((s) => ({ value: s, label: s })),
                ]}
                className="min-w-[160px]"
              />
              <AccountCombobox
                accounts={accounts}
                value={accountFilter}
                onChange={setAccountFilter}
              />
              <Select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                options={[
                  { value: "due", label: "Sort: Due Date" },
                  { value: "amount", label: "Sort: Amount" },
                  { value: "newest", label: "Sort: Newest" },
                ]}
                className="min-w-[160px]"
              />
            </>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : view === "board" ? (
        <BoardView
          ordersByStatus={ordersByStatus}
          findAccount={findAccount}
          onEdit={setEditingOrder}
          onStatusChange={handleQuickStatusChange}
        />
      ) : (
        <ListView
          orders={filtered}
          findAccount={findAccount}
          onEdit={setEditingOrder}
          onStatusChange={handleQuickStatusChange}
          onDuplicate={handleDuplicateOrder}
          grouped={view === "active" && sortKey === "due"}
        />
      )}

      {/* Modals */}
      {editingOrder && (
        <OrderModal
          accountName={editingOrder.account_name}
          initialOrder={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSubmit={handleSaveOrder}
          onDelete={handleDeleteOrder}
        />
      )}
      {showCreateForAccount && (
        <NewOrderAccountPicker
          accounts={accounts}
          onPick={(acc) => setShowCreateForAccount(acc)}
          onClose={() => setShowCreateForAccount(null)}
          onSubmit={handleSaveOrder}
          selected={showCreateForAccount}
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
    <div
      className="relative overflow-hidden rounded-2xl border border-rs-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_50px_rgba(9,4,26,0.35)] backdrop-blur"
    >
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
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-bold"
      style={{
        background: `${color}22`,
        borderColor: `${color}55`,
        color,
      }}
    >
      {accountInitials(name)}
    </div>
  );
}

type DueBucket = "Overdue" | "This Week" | "Next Week" | "Later" | "No Due Date";

function bucketForOrder(order: OrderRecord): DueBucket {
  const target = order.fulfillment_date || order.due_date;
  if (!target) return "No Due Date";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${target}T00:00:00`);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "Overdue";
  if (diff <= 7) return "This Week";
  if (diff <= 14) return "Next Week";
  return "Later";
}

const BUCKET_ORDER: DueBucket[] = ["Overdue", "This Week", "Next Week", "Later", "No Due Date"];
const BUCKET_ACCENT: Record<DueBucket, string> = {
  Overdue: "#ff4f9f",
  "This Week": "#ffb321",
  "Next Week": "#64f5ea",
  Later: "#a78bfa",
  "No Due Date": "#8c7fbd",
};

function ListView({
  orders,
  findAccount,
  onEdit,
  onStatusChange,
  onDuplicate,
  grouped,
}: {
  orders: OrderRecord[];
  findAccount: (order: OrderRecord) => AnyAccount | undefined;
  onEdit: (order: OrderRecord) => void;
  onStatusChange: (order: OrderRecord, status: OrderStatus) => void;
  onDuplicate: (order: OrderRecord) => void;
  grouped: boolean;
}) {
  if (orders.length === 0) {
    return (
      <Card className="py-12 text-center">
        <div className="text-2xl">🍜</div>
        <div className="mt-2 text-sm text-[#af9fe6]">No orders match these filters.</div>
      </Card>
    );
  }

  if (grouped) {
    const buckets: Record<DueBucket, OrderRecord[]> = {
      Overdue: [],
      "This Week": [],
      "Next Week": [],
      Later: [],
      "No Due Date": [],
    };
    for (const order of orders) buckets[bucketForOrder(order)].push(order);

    return (
      <div className="space-y-5">
        {BUCKET_ORDER.map((bucket) => {
          const list = buckets[bucket];
          if (list.length === 0) return null;
          const total = list.reduce((sum, o) => sum + (o.amount || 0), 0);
          const accent = BUCKET_ACCENT[bucket];
          return (
            <div key={bucket} className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}99` }} />
                <h3 className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: accent }}>
                  {bucket}
                </h3>
                <span className="text-[10px] text-[#8c7fbd]">{list.length} · {formatMoney(total)}</span>
                <span className="h-px flex-1 bg-rs-border/40" />
              </div>
              <OrderRows
                orders={list}
                findAccount={findAccount}
                onEdit={onEdit}
                onStatusChange={onStatusChange}
                onDuplicate={onDuplicate}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <OrderRows
      orders={orders}
      findAccount={findAccount}
      onEdit={onEdit}
      onStatusChange={onStatusChange}
      onDuplicate={onDuplicate}
    />
  );
}

function OrderRows({
  orders,
  findAccount,
  onEdit,
  onStatusChange,
  onDuplicate,
}: {
  orders: OrderRecord[];
  findAccount: (order: OrderRecord) => AnyAccount | undefined;
  onEdit: (order: OrderRecord) => void;
  onStatusChange: (order: OrderRecord, status: OrderStatus) => void;
  onDuplicate: (order: OrderRecord) => void;
}) {
  return (
    <div className="space-y-2">
      {orders.map((order) => {
        const account = findAccount(order);
        const parsed = parseOrderDetails(order.details);
        const due = dueLabel(order);
        const itemSummary = parsed.lineItems.length
          ? summarizeLineItems(parsed.lineItems, 3)
          : parsed.freeText || "No items listed";
        const accent = STATUS_COLORS[order.status];
        return (
          <div
            key={order.id}
            role="button"
            tabIndex={0}
            onClick={() => onEdit(order)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onEdit(order);
              }
            }}
            className="group relative flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-xl border border-rs-border/60 bg-white/[0.03] p-4 pl-5 text-left transition-all hover:border-rs-gold/40 hover:bg-white/[0.06]"
          >
            {/* Status colored bar */}
            <span
              className="absolute left-0 top-0 h-full w-1"
              style={{ background: accent, boxShadow: `0 0 14px ${accent}66` }}
            />

            <Avatar name={order.account_name} color={accent} />

            {/* Account + order name */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {account ? (
                  <Link
                    href={`/accounts/${account._tabSlug}/${account._rowIndex}`}
                    onClick={(e) => e.stopPropagation()}
                    className="truncate text-base font-bold text-rs-cream hover:text-rs-gold"
                  >
                    {order.account_name}
                  </Link>
                ) : (
                  <div className="truncate text-base font-bold text-rs-cream">
                    {order.account_name}
                  </div>
                )}
                {order.priority && order.priority !== "Normal" && (
                  <span className="rounded-full border border-rs-punch/40 bg-rs-punch/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ffd6e8]">
                    {order.priority}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-sm text-[#d8ccfb]">
                {order.order_name || "Untitled order"}
              </div>
              <div className="mt-1 truncate text-xs text-[#8c7fbd]">{itemSummary}</div>
            </div>

            {/* Due date chip */}
            <div className="hidden shrink-0 sm:block">
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${TONE_CLASSES[due.tone]}`}
              >
                {due.text}
              </span>
            </div>

            {/* Amount */}
            <div className="shrink-0 text-right">
              <div className="text-xl font-black tracking-tight text-rs-gold">
                {formatMoney(order.amount || 0)}
              </div>
            </div>

            {/* Status pill (acts as quick-change menu) */}
            <div className="shrink-0">
              <select
                value={order.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onStatusChange(order, e.target.value as OrderStatus)}
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
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s} style={{ background: "#1a0f45", color: "#fff4e8" }}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Duplicate */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(order);
              }}
              className="shrink-0 rounded-lg border border-rs-cyan/40 bg-rs-cyan/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-rs-cyan opacity-0 transition-opacity hover:bg-rs-cyan/20 group-hover:opacity-100"
              title="Duplicate order"
            >
              Copy
            </button>
          </div>
        );
      })}
    </div>
  );
}

function BoardView({
  ordersByStatus,
  findAccount,
  onEdit,
  onStatusChange,
}: {
  ordersByStatus: Record<OrderStatus, OrderRecord[]>;
  findAccount: (order: OrderRecord) => AnyAccount | undefined;
  onEdit: (order: OrderRecord) => void;
  onStatusChange: (order: OrderRecord, status: OrderStatus) => void;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-7">
      {ORDER_STATUSES.map((status) => {
        const accent = STATUS_COLORS[status];
        const count = ordersByStatus[status].length;
        const total = ordersByStatus[status].reduce((sum, o) => sum + (o.amount || 0), 0);
        return (
          <section
            key={status}
            className="min-w-0 overflow-hidden rounded-2xl border border-rs-border/70 bg-white/[0.02]"
          >
            <div
              className="border-b border-rs-border/60 px-3 py-3"
              style={{
                background: `linear-gradient(180deg, ${accent}1c, transparent)`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: accent, boxShadow: `0 0 10px ${accent}99` }}
                  />
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>
                    {status}
                  </div>
                </div>
                <div className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-rs-cream">
                  {count}
                </div>
              </div>
              {total > 0 && (
                <div className="mt-1 text-[10px] font-semibold text-[#8c7fbd]">
                  {formatMoney(total)}
                </div>
              )}
            </div>
            <div className="space-y-2 p-2">
              {ordersByStatus[status].map((order) => {
                const account = findAccount(order);
                const parsed = parseOrderDetails(order.details);
                const due = dueLabel(order);
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onEdit(order)}
                    className="group relative w-full overflow-hidden rounded-xl border border-rs-border/60 bg-rs-bg/70 p-3 pl-3.5 text-left transition-all hover:border-rs-gold/40 hover:bg-rs-bg/95"
                  >
                    <span
                      className="absolute left-0 top-0 h-full w-0.5"
                      style={{ background: accent }}
                    />
                    <div className="flex items-start gap-2">
                      <Avatar name={order.account_name} color={accent} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-rs-cream">
                          {order.account_name}
                        </div>
                        <div className="truncate text-[11px] text-[#af9fe6]">
                          {order.order_name || "Untitled"}
                        </div>
                      </div>
                    </div>
                    {parsed.lineItems.length > 0 && (
                      <div className="mt-2 truncate text-[11px] text-[#d8ccfb]">
                        {summarizeLineItems(parsed.lineItems, 2)}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${TONE_CLASSES[due.tone]}`}>
                        {due.text}
                      </span>
                      <span className="text-base font-black text-rs-gold">
                        {formatMoney(order.amount || 0)}
                      </span>
                    </div>
                    <select
                      value={order.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onStatusChange(order, e.target.value as OrderStatus)}
                      className="mt-2 w-full rounded-lg border border-rs-border/60 bg-black/30 px-2 py-1 text-[11px] text-rs-cream"
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    {account && (
                      <Link
                        href={`/accounts/${account._tabSlug}/${account._rowIndex}`}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 inline-block text-[10px] text-rs-cyan hover:underline"
                      >
                        Open account →
                      </Link>
                    )}
                  </button>
                );
              })}
              {count === 0 && (
                <div className="rounded-xl border border-dashed border-rs-border/40 px-3 py-6 text-center text-[10px] text-[#8c7fbd]">
                  No orders
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function NewOrderAccountPicker({
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
  onSubmit: (data: OrderFormData) => Promise<void>;
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
      <OrderModal
        accountName={selected.account}
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
