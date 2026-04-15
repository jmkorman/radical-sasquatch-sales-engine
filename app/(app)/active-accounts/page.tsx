"use client";

import { useEffect, useState } from "react";
import { useSheetStore } from "@/stores/useSheetStore";
import { useTrashStore, DeletedEntry } from "@/stores/useTrashStore";
import { AnyAccount } from "@/types/accounts";
import { STATUS_COLORS } from "@/lib/utils/constants";
import { formatDateShort } from "@/lib/utils/dates";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export default function ActiveAccountsPage() {
  const [accounts, setAccounts] = useState<AnyAccount[]>([]);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const { data } = useSheetStore();
  const { entries: trash, removeFromTrash, clearTrash } = useTrashStore();

  useEffect(() => {
    const activeTab = data.find((tab) => tab.tab === "Active Accounts");
    if (activeTab) {
      setAccounts(activeTab.accounts);
    }
  }, [data]);

  const handleEditStart = (cellId: string, value: string) => {
    setEditingCell(cellId);
    setEditValue(value);
  };

  const handleEditSave = async (
    account: AnyAccount,
    field: string,
    value: string
  ) => {
    if (value === editValue) {
      setEditingCell(null);
      return;
    }

    const updates: Record<string, string> = {
      [field]: value,
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rs-border">
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Account</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Contact</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Status</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Next Steps</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Last Contact</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Email</th>
                <th className="text-left py-3 px-4 text-rs-gold font-semibold">Phone</th>
                <th className="text-center py-3 px-4 text-rs-gold font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr
                  key={`${account._tabSlug}_${account._rowIndex}`}
                  className="border-b border-rs-border hover:bg-rs-surface transition-colors"
                >
                  <td className="py-3 px-4 text-white font-medium">{account.account}</td>

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
                        <option value="Qualified">Qualified</option>
                        <option value="Demo">Demo</option>
                        <option value="Proposal">Proposal</option>
                        <option value="Closed Won">Closed Won</option>
                        <option value="Not Interested">Not Interested</option>
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

                  <td className="py-3 px-4 text-gray-400">
                    {account.contactDate
                      ? formatDateShort(account.contactDate)
                      : "-"}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {accounts.length === 0 && !showTrash && (
        <div className="text-center py-12 text-gray-400">
          <p>No active accounts</p>
        </div>
      )}
    </div>
  );
}
