import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { ActivityLog, DeletedLogEntry } from "@/types/activity";

export interface DeletedEntry {
  id: string;
  account_id: string;
  account_name: string;
  tab: string;
  action_type: string;
  note: string;
  deleted_at: string;
}

interface TrashStore {
  entries: DeletedEntry[];
  deletedLogs: DeletedLogEntry[];
  addToTrash: (entry: DeletedEntry) => void;
  removeFromTrash: (id: string) => void;
  clearTrash: () => void;
  addLogToTrash: (log: ActivityLog) => void;
  restoreLogFromTrash: (id: string) => void;
  clearLogTrash: () => void;
}

// Initialize state from localStorage synchronously on module load
const loadInitialState = () => {
  if (typeof window === "undefined") return { entries: [], deletedLogs: [] };
  try {
    const stored = localStorage.getItem("trash-storage");
    if (!stored) return { entries: [], deletedLogs: [] };
    const parsed = JSON.parse(stored);
    return parsed.state || { entries: [], deletedLogs: [] };
  } catch {
    return { entries: [], deletedLogs: [] };
  }
};

const initialState = loadInitialState();

export const useTrashStore = create<TrashStore>()(
  persist(
    (set, get) => ({
      entries: initialState.entries,
      deletedLogs: initialState.deletedLogs,

      addToTrash: (entry) =>
        set((state) => ({
          entries: [entry, ...state.entries.filter((item) => item.id !== entry.id)],
        })),

      removeFromTrash: (id) =>
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== id),
        })),

      clearTrash: () => set({ entries: [] }),

      addLogToTrash: (log) => {
        const existing = get().deletedLogs;
        if (existing.some((entry) => entry.id === log.id)) return;

        set({
          deletedLogs: [
            {
              id: log.id,
              deleted_at: new Date().toISOString(),
              log,
            },
            ...existing,
          ],
        });
      },

      restoreLogFromTrash: (id) =>
        set((state) => ({
          deletedLogs: state.deletedLogs.filter((entry) => entry.id !== id),
        })),

      clearLogTrash: () => set({ deletedLogs: [] }),
    }),
    {
      name: "trash-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
