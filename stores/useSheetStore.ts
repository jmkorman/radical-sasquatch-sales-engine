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
  fetchAllTabs: () => Promise<void>;
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

  fetchAllTabs: async () => {
    set({ syncStatus: "syncing" });
    try {
      const res = await fetch("/api/sheets");
      if (!res.ok) throw new Error("Failed to fetch sheets");
      const data = await res.json();
      set({ data, lastSynced: new Date(), syncStatus: "idle" });
    } catch {
      set({ syncStatus: "error" });
      useUIStore.getState().showActionFeedback("Couldn’t refresh data from Google Sheets.", "error");
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

      if (!res.ok) throw new Error("Failed to update sheet");

      // Refetch to get fresh data
      await get().fetchAllTabs();
    } catch {
      set({ data: prev, syncStatus: "error" });
      useUIStore.getState().showActionFeedback("Couldn’t save that sheet update.", "error");
    }
  },
}));
