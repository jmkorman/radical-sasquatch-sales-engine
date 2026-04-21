"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// Initialize state from localStorage synchronously on module load
const loadOutreachInitialState = () => {
  if (typeof window === "undefined") return { entries: [] };
  try {
    const stored = localStorage.getItem("rs-outreach-log");
    if (!stored) return { entries: [] };
    const parsed = JSON.parse(stored);
    return parsed.state || { entries: [] };
  } catch {
    return { entries: [] };
  }
};

const outreachInitialState = loadOutreachInitialState();

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
  next_action_type?: string | null;
  created_at: string;
  source?: string;
  activity_kind?: "outreach" | "note" | "research" | "order";
  counts_as_contact?: boolean;
}

interface OutreachStore {
  entries: OutreachEntry[];
  addEntry: (entry: Omit<OutreachEntry, "id" | "created_at">) => OutreachEntry;
  restoreEntry: (entry: OutreachEntry) => void;
  updateEntry: (id: string, updates: Partial<OutreachEntry>) => void;
  removeEntry: (id: string) => void;
  getEntriesForAccount: (accountId: string) => OutreachEntry[];
  getLatestForAccount: (accountId: string) => OutreachEntry | null;
}

export const useOutreachStore = create<OutreachStore>()(
  persist(
    (set, get) => ({
      entries: outreachInitialState.entries,

      addEntry: (entry) => {
        const newEntry: OutreachEntry = {
          ...entry,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        };
        set((state) => ({
          entries: [newEntry, ...state.entries],
        }));
        return newEntry;
      },

      restoreEntry: (entry) =>
        set((state) => ({
          entries: [entry, ...state.entries.filter((existing) => existing.id !== entry.id)],
        })),

      updateEntry: (id, updates) =>
        set((state) => ({
          entries: state.entries.map((entry) =>
            entry.id === id ? { ...entry, ...updates } : entry
          ),
        })),

      removeEntry: (id) =>
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== id),
        })),

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
