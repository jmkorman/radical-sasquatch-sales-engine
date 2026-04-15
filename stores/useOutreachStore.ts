"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface OutreachEntry {
  id: string;
  account_id: string;
  account_name: string;
  tab: string;
  action_type: string;
  note: string;
  status_before: string;
  status_after: string;
  follow_up_date: string | null;
  created_at: string;
}

interface OutreachStore {
  entries: OutreachEntry[];
  addEntry: (entry: Omit<OutreachEntry, "id" | "created_at">) => void;
  getEntriesForAccount: (accountId: string) => OutreachEntry[];
  getLatestForAccount: (accountId: string) => OutreachEntry | null;
}

export const useOutreachStore = create<OutreachStore>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (entry) => {
        const newEntry: OutreachEntry = {
          ...entry,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        };
        set((state) => ({
          entries: [newEntry, ...state.entries],
        }));
      },

      getEntriesForAccount: (accountId) => {
        return get().entries.filter((e) => e.account_id === accountId);
      },

      getLatestForAccount: (accountId) => {
        return get().entries.find((e) => e.account_id === accountId) ?? null;
      },
    }),
    {
      name: "rs-outreach-log",
    }
  )
);
