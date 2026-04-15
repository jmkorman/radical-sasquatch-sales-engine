"use client";

import { useEffect, useMemo, useState } from "react";
import { useSheetStore } from "@/stores/useSheetStore";
import { useTrashStore, DeletedEntry } from "@/stores/useTrashStore";
import { AnyAccount } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { OrderRecord } from "@/types/orders";
import { formatDateShort, dateToTimestamp, getContactAgeClass } from "@/lib/utils/dates";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SearchBar } from "@/components/ui/SearchBar";
import Link from "next/link";
import { countsAsContact } from "@/lib/activity/helpers";
import { getOrderStats } from "@/lib/orders/helpers";

export default function ActiveAccountsPage() {
  const [accounts, setAccounts] = useState<AnyAccount[]>([]);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "name" | "order">("recent");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const { data } = useSheetStore();
  const { entries: trash, removeFromTrash, clearTrash } = useTrashStore();

  useEffect(() => {
    if (data?.activeAccounts) {
      setAccounts(
        data.activeAccounts.filter((account) =>
          account.account.toLowerCase().includes("leever")
        )
      );
    }
  }, [data]);

  useEffect(() => {
    async function loadSupportingData() {
      try {
        const [activityResponse, ordersResponse] = await Promise.all([
          fetch("/api/activity"),
          fetch("/api/orders"),
        ]);
        if (activityResponse.ok) {
          setLogs(await activityResponse.json());
        }
        if (ordersResponse.ok) {
          setOrders(await ordersResponse.json());
        }
      } catch {
        setLogs([]);
        setOrders([]);
      }
    }

    loadSupportingData();
  }, []);

  const handleEditStart = (cellId: string, value: string) => {
    setEditingCell(cellId);
    setEditValue(value);
  };

  const handleEditSave = async (
    account: AnyAccount,
    field: string,
    value: string
  ) => {
    const currentValue =
      field === "CONTACT_NAME"
        ? account.contactName || ""
        : field === "STATUS"
          ? account.status || ""
          : field === "NEXT_STEPS"
            ? account.nextSteps || ""
            : "";

    if (value === currentValue) {
      setEditingCell(null);
      return;
    }

    // Map field names to API parameter names
    const fieldMap: Record<string, string> = {
      CONTACT_NAME: "contactName",
      STATUS: "newStatus",
      NEXT_STEPS: "nextSteps",
    };

    const apiField = fieldMap[field] || field;
    const updates: Record<string, string> = {
      [apiField]: value,
    };

    await fetch("/api/sheets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tab: "Active Accounts",
        rowIndex: account._rowIndex,
        ...updates,
      }),
    });

    setAccounts((existing) =>
      existing.map((item) => {
        if (item._rowIndex !== account._rowIndex) return item;
        if (field === "CONTACT_NAME") return { ...item, contactName: value };
        if (field === "STATUS") return { ...item, status: value as AnyAccount["status"] };
        if (field === "NEXT_STEPS") return { ...item, nextSteps: value };
        return item;
      })
    );
    setEditingCell(null);
  };

  const handleDelete = (account: AnyAccount) => {
    const entry: DeletedEntry = {
      id: `${account._tabSlug}_${account._rowIndex}`,
      account_id: `${account._tabSlug}_${account._rowIndex}`,
      account_name: account.account,
      tab: "Active Accounts",
      action_type: "delete",
      note: `Deleted account: ${account.account}`,
      deleted_at: new Date().toISOString(),
    };

    useTrashStore.getState().addToTrash(entry);
    setAccounts(accounts.filter((a) => a._rowIndex !== account._rowIndex));
  };

  const handleRestore = (entry: DeletedEntry) => {
    removeFromTrash(entry.id);
    // Restore would require re-adding the row to the sheet
    // For now, just remove from trash
  };

  const visibleAccounts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const filtered = accounts.filter((account) => {
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

    return [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.account.localeCompare(b.account);
      if (sortBy === "oldest") return dateToTimestamp(a.contactDate) - dateToTimestamp(b.contactDate);
      if (sortBy === "order") {
        const aValue = parseFloat(("order" in a ? a.order : "").replace(/[^0-9.]/g, "")) || 0;
        const bValue = parseFloat(("order" in b ? b.order : "").replace(/[^0-9.]/g, "")) || 0;
        return bValue - aValue;
      }
      return dateToTimestamp(b.contactDate) - dateToTimestamp(a.contactDate);
    });
  }, [accounts, search, sortBy]);

  const orderTotal = useMemo(
    () =>
      visibleAccounts.reduce((sum, account) => {
        const raw = "order" in account ? account.order : "";
        const value = parseFloat(raw.replace(/[^0-9.]/g, ""));
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [visibleAccounts]
  );

  const latestContactByAccount = useMemo(() => {
    const map: Record<string, ActivityLog | null> = {};
    const sorted = [...logs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    for (const log of sorted) {
      if (!countsAsContact(log)) continue;
      if (!map[log.account_id]) {
        map[log.account_id] = log;
      }
    }

    return map;
  }, [logs]);

  const nextFollowUpByAccount = useMemo(() => {
    const map: Record<string, string> = {};
    const sorted = [...logs].sort(
      (a, b) => new Date(a.follow_up_date || "9999-12-31").getTime() - new Date(b.follow_up_date || "9999-12-31").getTime()
    );

    for (const log of sorted) {
      if (!log.follow_up_date) continue;
      if (!map[log.account_id]) {
        map[log.account_id] = log.follow_up_date;
      }
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-rs-gold">Active Accounts</h1>
        {trash.length > 0 && (
          <Button
            onClick={() => setShowTrash(!showTrash)}
            variant={showTrash ? "primary" : "secondary"}
          >
            🗑️ Trash ({trash.length})
          </Button>
        )}
      </div>

      {showTrash ? (
        <div className="bg-rs-surface border border-rs-punch rounded-lg p-6">
          <h2 className="text-xl font-bold text-rs-gold mb-4">Deleted Items</h2>
          {trash.length === 0 ? (
            <p className="text-gray-400">No deleted items</p>
          ) : (
            <div className="space-y-2">
              {trash.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between bg-rs-bg p-3 rounded"
                >
                  <div>
                    <p className="font-medium text-white">{entry.account_name}</p>
                    <p className="text-sm text-gray-400">
                      Deleted {formatDateShort(entry.deleted_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleRestore(entry)}
                      variant="secondary"
                      className="text-sm"
                    >
                      Restore
                    </Button>
                  </div>
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
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-rs-border/70 bg-white/5 p-4">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Active Deals</div>
              <div className="mt-2 text-3xl font-black text-rs-cream">{visibleAccounts.length}</div>
            </div>
            <div className="rounded-2xl border border-rs-border/70 bg-white/5 p-4">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Needs Follow Up</div>
              <div className="mt-2 text-3xl font-black text-rs-cream">
                {visibleAccounts.filter((account) => account.status === "Following Up").length}
              </div>
            </div>
            <div className="rounded-2xl border border-rs-border/70 bg-white/5 p-4">
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Recent Purchase Total</div>
              <div className="mt-2 text-3xl font-black text-rs-cream">
                ${orderTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex-1">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search account, contact, email, phone, next step, purchase"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["recent", "Recent Contact"],
                ["oldest", "Oldest Contact"],
                ["order", "Biggest Purchase"],
                ["name", "A to Z"],
              ].map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={sortBy === key ? "primary" : "secondary"}
                  onClick={() => setSortBy(key as typeof sortBy)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rs-border">
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Account</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Contact</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Status</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Next Steps</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Last Contact</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Next Follow-Up</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Recent Purchase</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Lifetime Ordered</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Orders</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Email</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Phone</th>
                <th className="text-center py-3 px-4 text-rs-gold font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((account) => {
                const accountId = `${account._tabSlug}_${account._rowIndex}`;
                const latestContact = latestContactByAccount[accountId];
                const followUpDate = nextFollowUpByAccount[accountId];
                const stats = getOrderStats(ordersByAccount[accountId] ?? []);
                const displayLastContact = latestContact?.created_at || account.contactDate;

                return (
                  <tr
                    key={`${account._tabSlug}_${account._rowIndex}`}
                    className="border-b border-rs-border hover:bg-rs-surface transition-colors"
                  >
                  <td className="py-3 px-4">
                    <div className="font-medium text-white">{account.account}</div>
                    <Link
                      href={`/accounts/${account._tabSlug}/${account._rowIndex}`}
                      className="text-xs text-rs-gold hover:text-rs-cream"
                    >
                      Open account folder
                    </Link>
                  </td>

                  {/* Contact Name - Editable */}
                  <td className="py-3 px-4">
                    {editingCell === `contact_${account._rowIndex}` ? (
                      <input
                        autoFocus
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() =>
                          handleEditSave(account, "CONTACT_NAME", editValue)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleEditSave(account, "CONTACT_NAME", editValue);
                        }}
                        className="w-full bg-rs-bg border border-rs-gold rounded px-2 py-1 text-white"
                      />
                    ) : (
                      <div
                        onClick={() =>
                          handleEditStart(
                            `contact_${account._rowIndex}`,
                            account.contactName || ""
                          )
                        }
                        className="cursor-pointer hover:text-rs-gold text-gray-300"
                      >
                        {account.contactName || "-"}
                      </div>
                    )}
                  </td>

                  {/* Status - Editable */}
                  <td className="py-3 px-4">
                    {editingCell === `status_${account._rowIndex}` ? (
                      <select
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() =>
                          handleEditSave(account, "STATUS", editValue)
                        }
                        className="bg-rs-bg border border-rs-gold rounded px-2 py-1 text-white"
                      >
                        <option value="Contacted">Contacted</option>
                        <option value="Identified">Identified</option>
                        <option value="Researched">Researched</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Following Up">Following Up</option>
                        <option value="Closed - Won">Closed - Won</option>
                      </select>
                    ) : (
                      <div
                        onClick={() =>
                          handleEditStart(
                            `status_${account._rowIndex}`,
                            account.status || ""
                          )
                        }
                        className="cursor-pointer"
                      >
                        <Badge
                          status={account.status || ""}
                          className="hover:opacity-80"
                        />
                      </div>
                    )}
                  </td>

                  {/* Next Steps - Editable */}
                  <td className="py-3 px-4">
                    {editingCell === `next_${account._rowIndex}` ? (
                      <input
                        autoFocus
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() =>
                          handleEditSave(account, "NEXT_STEPS", editValue)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleEditSave(account, "NEXT_STEPS", editValue);
                        }}
                        className="w-full bg-rs-bg border border-rs-gold rounded px-2 py-1 text-white text-xs"
                        maxLength={50}
                      />
                    ) : (
                      <div
                        onClick={() =>
                          handleEditStart(
                            `next_${account._rowIndex}`,
                            account.nextSteps || ""
                          )
                        }
                        className="cursor-pointer hover:text-rs-gold text-gray-300 text-xs truncate max-w-xs"
                      >
                        {account.nextSteps || "-"}
                      </div>
                    )}
                  </td>

                  <td className={`py-3 px-4 text-gray-400 ${getContactAgeClass(displayLastContact)}`}>
                    {displayLastContact
                      ? formatDateShort(displayLastContact)
                      : "-"}
                  </td>
                  <td className="py-3 px-4 text-[#d8ccfb]">
                    {followUpDate ? formatDateShort(followUpDate) : "-"}
                  </td>
                  <td className="py-3 px-4 text-rs-cream">
                    {stats.latest
                      ? `$${stats.latest.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                      : ("order" in account && account.order ? account.order : "-")}
                  </td>
                  <td className="py-3 px-4 text-rs-cream">
                    ${stats.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-3 px-4 text-[#d8ccfb]">
                    {stats.count}
                  </td>
                  <td className="py-3 px-4 text-gray-400 text-xs truncate max-w-xs">
                    {account.email || "-"}
                  </td>
                  <td className="py-3 px-4 text-gray-400 text-xs">
                    {account.phone || "-"}
                  </td>

                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleDelete(account)}
                      className="text-red-400 hover:text-red-300 transition-colors text-xs"
                    >
                      Delete
                    </button>
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {visibleAccounts.length === 0 && !showTrash && (
        <div className="text-center py-12 text-gray-400">
          <p>No active accounts</p>
        </div>
      )}
    </div>
  );
}
