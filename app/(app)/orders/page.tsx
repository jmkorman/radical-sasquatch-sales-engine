"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AllTabsData, AnyAccount } from "@/types/accounts";
import { OrderRecord, ORDER_PRIORITIES, ORDER_STATUSES, OrderStatus } from "@/types/orders";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Spinner } from "@/components/ui/Spinner";
import { useSheetStore } from "@/stores/useSheetStore";
import { useUIStore } from "@/stores/useUIStore";
import { getAccountPrimaryId } from "@/lib/accounts/identity";
import { formatDate, todayISO } from "@/lib/utils/dates";

const STATUS_COLORS: Record<OrderStatus, string> = {
  New: "#64f5ea",
  Confirmed: "#4d8cff",
  "In Production": "#ffb321",
  Ready: "#44d39f",
  Delivered: "#8c7fbd",
  "Invoiced/Paid": "#fff4e8",
  Canceled: "#ff7c70",
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

function emptyDraft() {
  return {
    accountId: "",
    orderName: "",
    orderDate: todayISO(),
    dueDate: "",
    fulfillmentDate: "",
    status: "New",
    priority: "Normal",
    owner: "",
    details: "",
    productionNotes: "",
    amount: "",
  };
}

export default function OrdersPage() {
  const { data, fetchAllTabs } = useSheetStore();
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, string>>({});

  const accounts = useMemo(() => (data ? getAllAccounts(data) : []), [data]);
  const selectedAccount = accounts.find((account) => getAccountPrimaryId(account) === draft.accountId);

  async function loadOrders() {
    setLoading(true);
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load orders");
      setOrders(await response.json());
    } catch {
      setOrders([]);
      showActionFeedback("Couldn’t load orders.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeOrders = orders.filter((order) => order.status !== "Canceled" && order.status !== "Delivered");

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

    for (const order of orders) {
      map[order.status]?.push(order);
    }

    for (const status of ORDER_STATUSES) {
      map[status].sort((a, b) => {
        const aDate = a.due_date || a.fulfillment_date || a.order_date || a.created_at;
        const bDate = b.due_date || b.fulfillment_date || b.order_date || b.created_at;
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      });
    }

    return map;
  }, [orders]);

  const handleCreateOrder = async () => {
    if (!selectedAccount || !draft.orderName.trim()) return;
    setCreating(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: getAccountPrimaryId(selectedAccount),
          account_name: selectedAccount.account,
          tab: selectedAccount._tabSlug,
          row_index: selectedAccount._rowIndex,
          account_type: selectedAccount.type,
          contact_name: selectedAccount.contactName,
          phone: selectedAccount.phone,
          email: selectedAccount.email,
          order_name: draft.orderName,
          order_date: draft.orderDate,
          due_date: draft.dueDate || null,
          fulfillment_date: draft.fulfillmentDate || null,
          status: draft.status,
          priority: draft.priority,
          owner: draft.owner || null,
          details: draft.details || null,
          production_notes: draft.productionNotes || null,
          amount: draft.amount ? parseFloat(draft.amount) : 0,
          notes: draft.productionNotes || null,
        }),
      });

      if (!response.ok) throw new Error("Failed to create order");
      const created: OrderRecord = await response.json();
      setOrders((existing) => [created, ...existing]);
      setDraft(emptyDraft());
      setShowForm(false);
      void fetchAllTabs({ silent: true });
      showActionFeedback("Order created.", "success");
    } catch {
      showActionFeedback("Couldn’t create that order.", "error");
    } finally {
      setCreating(false);
    }
  };

  const updateOrder = async (order: OrderRecord, updates: Partial<OrderRecord>, progressNote?: string) => {
    try {
      const response = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, updates, progressNote }),
      });
      if (!response.ok) throw new Error("Failed to update order");
      const updated: OrderRecord = await response.json();
      setOrders((existing) => existing.map((entry) => (entry.id === updated.id ? updated : entry)));
      showActionFeedback("Order updated.", "success");
    } catch {
      showActionFeedback("Couldn’t update that order.", "error");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-[#64f5ea]">Production Bridge</p>
          <h1 className="mt-2 text-3xl font-black text-rs-cream">Orders</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#d8ccfb]">
            Active customer orders, production status, delivery timing, and progress notes in one shared board.
          </p>
        </div>
        <Button onClick={() => setShowForm((value) => !value)}>
          {showForm ? "Close" : "+ New Order"}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Active Orders" value={String(activeOrders.length)} />
        <Metric label="In Production" value={String(ordersByStatus["In Production"].length)} />
        <Metric label="Ready" value={String(ordersByStatus.Ready.length)} />
        <Metric label="Delivered" value={String(ordersByStatus.Delivered.length)} />
      </div>

      {showForm && (
        <Card>
          <div className="grid gap-3 lg:grid-cols-4">
            <Select
              label="Account"
              value={draft.accountId}
              onChange={(event) => setDraft((prev) => ({ ...prev, accountId: event.target.value }))}
              options={[
                { value: "", label: "Choose account" },
                ...accounts.map((account) => ({
                  value: getAccountPrimaryId(account),
                  label: `${account.account} · ${account._tab}`,
                })),
              ]}
            />
            <Input
              label="Order Name"
              value={draft.orderName}
              onChange={(event) => setDraft((prev) => ({ ...prev, orderName: event.target.value }))}
              placeholder="Patio restock, event order, opening order"
            />
            <Input
              label="Due Date"
              type="date"
              value={draft.dueDate}
              onChange={(event) => setDraft((prev) => ({ ...prev, dueDate: event.target.value }))}
            />
            <Input
              label="Delivery/Pickup"
              type="date"
              value={draft.fulfillmentDate}
              onChange={(event) => setDraft((prev) => ({ ...prev, fulfillmentDate: event.target.value }))}
            />
            <Select
              label="Status"
              value={draft.status}
              onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}
              options={ORDER_STATUSES.map((status) => ({ value: status, label: status }))}
            />
            <Select
              label="Priority"
              value={draft.priority}
              onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value }))}
              options={ORDER_PRIORITIES.map((priority) => ({ value: priority, label: priority }))}
            />
            <Input
              label="Owner"
              value={draft.owner}
              onChange={(event) => setDraft((prev) => ({ ...prev, owner: event.target.value }))}
              placeholder="Production lead"
            />
            <Input
              label="Optional Amount"
              inputMode="decimal"
              value={draft.amount}
              onChange={(event) => setDraft((prev) => ({ ...prev, amount: event.target.value }))}
              placeholder="Not required"
            />
            <Textarea
              label="Order Details"
              className="lg:col-span-2"
              value={draft.details}
              onChange={(event) => setDraft((prev) => ({ ...prev, details: event.target.value }))}
              placeholder="Items, counts, packaging, delivery requirements"
            />
            <Textarea
              label="Production Notes"
              className="lg:col-span-2"
              value={draft.productionNotes}
              onChange={(event) => setDraft((prev) => ({ ...prev, productionNotes: event.target.value }))}
              placeholder="Prep constraints, handoff notes, anything production should know"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleCreateOrder} disabled={creating || !selectedAccount || !draft.orderName.trim()}>
              {creating ? "Creating..." : "Create Order"}
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-7">
          {ORDER_STATUSES.map((status) => (
            <section key={status} className="min-w-0 rounded-2xl border border-rs-border/70 bg-white/[0.03]">
              <div className="border-b border-rs-border/60 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: STATUS_COLORS[status], boxShadow: `0 0 10px ${STATUS_COLORS[status]}88` }}
                    />
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d8ccfb]">
                      {status}
                    </div>
                  </div>
                  <div className="rounded-full bg-white/8 px-2 py-0.5 text-xs font-bold text-rs-cream">
                    {ordersByStatus[status].length}
                  </div>
                </div>
              </div>
              <div className="space-y-3 p-3">
                {ordersByStatus[status].map((order) => {
                  const progressDraft = progressDrafts[order.id] ?? "";
                  return (
                    <article key={order.id} className="rounded-xl border border-rs-border/60 bg-rs-bg/70 p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/accounts/${order.tab}/${order.row_index ?? order.account_id.split("_").at(-1)}`}
                            className="font-bold text-rs-cream hover:text-rs-gold"
                          >
                            {order.account_name}
                          </Link>
                          <div className="mt-1 text-xs text-[#af9fe6]">{order.order_name || "Untitled order"}</div>
                        </div>
                        <span className="rounded-full border border-rs-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#d8ccfb]">
                          {order.priority || "Normal"}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-[#d8ccfb]">
                        {order.due_date && <div><span className="text-[#8c7fbd]">Due:</span> {formatDate(order.due_date)}</div>}
                        {order.fulfillment_date && <div><span className="text-[#8c7fbd]">Delivery:</span> {formatDate(order.fulfillment_date)}</div>}
                        {order.owner && <div><span className="text-[#8c7fbd]">Owner:</span> {order.owner}</div>}
                        {order.details && <div className="line-clamp-3">{order.details}</div>}
                      </div>

                      <div className="mt-3">
                        <Select
                          value={order.status}
                          onChange={(event) => {
                            void updateOrder(order, { status: event.target.value as OrderStatus });
                          }}
                          options={ORDER_STATUSES.map((entry) => ({ value: entry, label: entry }))}
                        />
                      </div>

                      <Textarea
                        className="mt-3"
                        value={progressDraft}
                        onChange={(event) =>
                          setProgressDrafts((existing) => ({ ...existing, [order.id]: event.target.value }))
                        }
                        placeholder="Add production update..."
                      />
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!progressDraft.trim()}
                          onClick={() => {
                            void updateOrder(order, {}, progressDraft.trim());
                            setProgressDrafts((existing) => ({ ...existing, [order.id]: "" }));
                          }}
                        >
                          Add Note
                        </Button>
                      </div>

                      {order.history && (
                        <div className="mt-3 border-t border-rs-border/50 pt-2 text-[11px] leading-relaxed text-[#af9fe6]">
                          {order.history.split("\n").slice(0, 2).map((entry) => (
                            <div key={entry}>{entry}</div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
                {ordersByStatus[status].length === 0 && (
                  <div className="rounded-xl border border-dashed border-rs-border/50 px-3 py-8 text-center text-xs text-[#8c7fbd]">
                    No orders
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-[0.28em] text-[#af9fe6]">{label}</div>
      <div className="mt-2 text-2xl font-black text-rs-cream">{value}</div>
    </Card>
  );
}
