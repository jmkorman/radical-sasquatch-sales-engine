"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { DateField } from "@/components/ui/DatePicker";
import { ORDER_STATUSES, ORDER_PRIORITIES, OrderRecord } from "@/types/orders";
import { OrderLineItem, lineItemsTotal, parseOrderDetails } from "@/lib/orders/lineItems";
import { todayISO } from "@/lib/utils/dates";

const PRODUCT_PRESETS: ReadonlyArray<{ label: string; name: string }> = [
  { label: "Pork Gyoza", name: "Pork Gyoza" },
  { label: "Kielbasa Sauerkraut Pierogi", name: "Kielbasa Sauerkraut Pierogi" },
  { label: "Garlic Parm Chicken Dumplings", name: "Garlic Parmesan Chicken Dumplings" },
  { label: "Cheddar Potato Pierogi", name: "Cheddar Potato Pierogis" },
];

export interface OrderFormData {
  orderName: string;
  orderDate: string;
  dueDate: string;
  fulfillmentDate: string;
  status: string;
  priority: string;
  owner: string;
  lineItems: OrderLineItem[];
  freeTextDetails: string;
  productionNotes: string;
  amount: number;
}

interface OrderModalProps {
  /** Existing order to edit, or null for a new order */
  initialOrder?: OrderRecord | null;
  accountName: string;
  onClose: () => void;
  onSubmit: (data: OrderFormData) => Promise<void>;
  /** When provided on an edit, shows a Delete button. */
  onDelete?: (orderId: string) => Promise<void>;
}

const EMPTY_LINE: OrderLineItem = { name: "", quantity: 1, unitPrice: 0 };

function fromRecord(record: OrderRecord | null | undefined): OrderFormData {
  if (!record) {
    return {
      orderName: "",
      orderDate: todayISO(),
      dueDate: "",
      fulfillmentDate: "",
      status: "New",
      priority: "Normal",
      owner: "",
      lineItems: [{ ...EMPTY_LINE }],
      freeTextDetails: "",
      productionNotes: "",
      amount: 0,
    };
  }
  const parsed = parseOrderDetails(record.details);
  return {
    orderName: record.order_name ?? "",
    orderDate: record.order_date ?? todayISO(),
    dueDate: record.due_date ?? "",
    fulfillmentDate: record.fulfillment_date ?? "",
    status: record.status ?? "New",
    priority: typeof record.priority === "string" ? record.priority : "Normal",
    owner: record.owner ?? "",
    lineItems: parsed.lineItems.length > 0 ? parsed.lineItems : [{ ...EMPTY_LINE }],
    freeTextDetails: parsed.freeText,
    productionNotes: record.production_notes ?? "",
    amount: typeof record.amount === "number" ? record.amount : 0,
  };
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function OrderModal({ initialOrder, accountName, onClose, onSubmit, onDelete }: OrderModalProps) {
  const isEdit = Boolean(initialOrder);
  const [draft, setDraft] = useState<OrderFormData>(() => fromRecord(initialOrder));
  const [submitting, setSubmitting] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!initialOrder || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(initialOrder.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  };

  const computedTotal = lineItemsTotal(draft.lineItems);
  const effectiveAmount = overrideAmount ? draft.amount : computedTotal;

  const updateLine = (index: number, patch: Partial<OrderLineItem>) => {
    setDraft((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };
  const addLine = () =>
    setDraft((prev) => ({ ...prev, lineItems: [...prev.lineItems, { ...EMPTY_LINE }] }));
  const removeLine = (index: number) =>
    setDraft((prev) => ({
      ...prev,
      lineItems: prev.lineItems.length === 1 ? prev.lineItems : prev.lineItems.filter((_, i) => i !== index),
    }));

  const canSubmit = draft.orderName.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ ...draft, amount: effectiveAmount });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`${isEdit ? "Edit" : "Log"} Order — ${accountName}`} onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        <Input
          label="Order Name"
          value={draft.orderName}
          onChange={(e) => setDraft((prev) => ({ ...prev, orderName: e.target.value }))}
          placeholder="Patio restock, opening order, event"
          autoFocus
        />

        {/* Line items */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm text-gray-300">Items</label>
            <button
              type="button"
              onClick={addLine}
              className="rounded-lg border border-rs-cyan/40 bg-rs-cyan/10 px-2.5 py-1 text-[11px] font-semibold text-rs-cyan hover:bg-rs-cyan/20"
            >
              + Add Item
            </button>
          </div>
          <div className="space-y-3">
            {draft.lineItems.map((item, idx) => {
              const matchedPreset = PRODUCT_PRESETS.find((p) => p.name === item.name);
              const isCustom = !matchedPreset && item.name.length > 0;
              return (
                <div key={idx} className="space-y-2 rounded-lg border border-rs-border/40 bg-black/10 p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {PRODUCT_PRESETS.map((preset) => {
                      const selected = matchedPreset?.name === preset.name;
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => updateLine(idx, { name: preset.name })}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                            selected
                              ? "border-rs-cyan bg-rs-cyan/20 text-rs-cyan"
                              : "border-rs-border/50 bg-white/5 text-[#af9fe6] hover:border-rs-cyan/40 hover:text-rs-cyan"
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => updateLine(idx, { name: "" })}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                        isCustom
                          ? "border-rs-gold bg-rs-gold/20 text-rs-gold"
                          : "border-rs-border/50 bg-white/5 text-[#af9fe6] hover:border-rs-gold/40 hover:text-rs-gold"
                      }`}
                    >
                      Other
                    </button>
                  </div>
                  <div className="grid grid-cols-[1fr_80px_100px_90px_30px] items-center gap-2">
                    <Input
                      value={item.name}
                      onChange={(e) => updateLine(idx, { name: e.target.value })}
                      placeholder="Item name"
                    />
                    <Input
                      inputMode="decimal"
                      value={String(item.quantity || "")}
                      onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 0 })}
                      placeholder="Qty"
                    />
                    <Input
                      inputMode="decimal"
                      value={String(item.unitPrice || "")}
                      onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) || 0 })}
                      placeholder="$ each"
                    />
                    <div className="text-right text-sm text-rs-cream">
                      {formatMoney((item.quantity || 0) * (item.unitPrice || 0))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={draft.lineItems.length === 1}
                      className="rounded text-[#af9fe6] hover:text-rs-punch disabled:opacity-30"
                      aria-label="Remove item"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-rs-border/60 bg-black/20 px-3 py-2">
            <span className="text-xs uppercase tracking-[0.2em] text-[#af9fe6]">Total</span>
            <div className="flex items-center gap-3">
              {overrideAmount ? (
                <Input
                  inputMode="decimal"
                  value={String(draft.amount || "")}
                  onChange={(e) => setDraft((prev) => ({ ...prev, amount: Number(e.target.value) || 0 }))}
                  placeholder="Override amount"
                  className="w-28"
                />
              ) : (
                <span className="text-lg font-bold text-rs-gold">{formatMoney(computedTotal)}</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setOverrideAmount((v) => !v);
                  if (!overrideAmount) {
                    setDraft((prev) => ({ ...prev, amount: computedTotal }));
                  }
                }}
                className="text-xs text-[#af9fe6] hover:text-rs-cream"
              >
                {overrideAmount ? "Use computed" : "Override"}
              </button>
            </div>
          </div>
        </div>

        {/* Dates */}
        <div className="grid gap-3 sm:grid-cols-3">
          <DateField
            label="Order Date"
            value={draft.orderDate}
            onChange={(date) => setDraft((prev) => ({ ...prev, orderDate: date }))}
          />
          <DateField
            label="Due Date"
            value={draft.dueDate}
            onChange={(date) => setDraft((prev) => ({ ...prev, dueDate: date }))}
            optional
          />
          <DateField
            label="Delivery / Pickup"
            value={draft.fulfillmentDate}
            onChange={(date) => setDraft((prev) => ({ ...prev, fulfillmentDate: date }))}
            optional
          />
        </div>

        {/* Status / Priority / Owner */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Status"
            value={draft.status}
            onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))}
            options={ORDER_STATUSES.map((status) => ({ value: status, label: status }))}
          />
          <Select
            label="Priority"
            value={draft.priority}
            onChange={(e) => setDraft((prev) => ({ ...prev, priority: e.target.value }))}
            options={ORDER_PRIORITIES.map((priority) => ({ value: priority, label: priority }))}
          />
          <Input
            label="Owner"
            value={draft.owner}
            onChange={(e) => setDraft((prev) => ({ ...prev, owner: e.target.value }))}
            placeholder="Production lead"
          />
        </div>

        <Textarea
          label="Order Notes"
          value={draft.freeTextDetails}
          onChange={(e) => setDraft((prev) => ({ ...prev, freeTextDetails: e.target.value }))}
          placeholder="Packaging, delivery instructions, anything you want to remember"
          rows={2}
        />

        <Textarea
          label="Production Notes"
          value={draft.productionNotes}
          onChange={(e) => setDraft((prev) => ({ ...prev, productionNotes: e.target.value }))}
          placeholder="Prep constraints, handoff notes"
          rows={2}
        />

        {error && (
          <div className="rounded-xl border border-rs-punch/50 bg-rs-punch/10 px-3 py-2 text-sm text-[#ffd6e8]">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {isEdit && onDelete && (
              confirmingDelete ? (
                <div className="flex items-center gap-2 rounded-lg border border-rs-punch/50 bg-rs-punch/10 px-3 py-1.5 text-xs text-[#ffd6e8]">
                  <span>Delete this order?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded bg-rs-punch px-2 py-0.5 text-[11px] font-bold text-white hover:bg-rs-punch/90 disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="text-[11px] text-[#af9fe6] hover:text-rs-cream"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="rounded-lg border border-rs-punch/40 bg-rs-punch/10 px-3 py-1.5 text-xs font-semibold text-[#ffd6e8] hover:bg-rs-punch/20"
                >
                  Delete order
                </button>
              )
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? "Saving..." : isEdit ? "Save Changes" : "Create Order"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
