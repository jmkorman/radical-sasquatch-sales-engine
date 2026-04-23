"use client";

import { create } from "zustand";
import { AllTabsData, AnyAccount } from "@/types/accounts";
import { SyncStatus } from "@/types/sheets";
import { useUIStore } from "./useUIStore";

interface SheetStore {
  data: AllTabsData | null;
  lastSynced: Date | null;
  syncStatus: SyncStatus;
  setData: (data: AllTabsData) => void;
  fetchAllTabs: (options?: { silent?: boolean }) => Promise<void>;
  updateAccountStatus: (
    tab: string,
    rowIndex: number,
    newStatus: string,
    contactDate?: string,
    nextSteps?: string
  ) => Promise<void>;
}

export const useSheetStore = create<SheetStore>((set, get) => ({
  data: null,
  lastSynced: null,
  syncStatus: "idle",

  setData: (data) => set({ data, lastSynced: new Date(), syncStatus: "idle" }),

  fetchAllTabs: async (options) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      set({ syncStatus: "syncing" });
    }

    try {
      const res = await fetch("/api/sheets", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch account data");
      const data = await res.json();
      set({ data, lastSynced: new Date(), syncStatus: "idle" });
    } catch {
      if (!silent) {
        set({ syncStatus: "error" });
        useUIStore.getState().showActionFeedback("Couldn’t refresh account data.", "error");
      }
    }
  },

  updateAccountStatus: async (tab, rowIndex, newStatus, contactDate, nextSteps) => {
    const prev = get().data;
    set({ syncStatus: "syncing" });

    try {
      const updates: { columnIndex: number; value: string }[] = [];

      // We send the update to the API which handles column mapping
      const res = await fetch("/api/sheets/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab, rowIndex, newStatus, contactDate, nextSteps }),
      });

      if (!res.ok) throw new Error("Failed to update account");

      // Refetch to get fresh data
      await get().fetchAllTabs();
    } catch {
      set({ data: prev, syncStatus: "error" });
      useUIStore.getState().showActionFeedback("Couldn’t save that account update.", "error");
    }
  },
}));
