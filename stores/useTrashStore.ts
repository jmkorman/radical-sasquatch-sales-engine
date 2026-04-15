import { create } from "zustand";

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
  addToTrash: (entry: DeletedEntry) => void;
  removeFromTrash: (id: string) => void;
  clearTrash: () => void;
}

export const useTrashStore = create<TrashStore>((set) => ({
  entries: [],

  addToTrash: (entry) =>
    set((state) => {
      const updated = [entry, ...state.entries];
      if (typeof window !== "undefined") {
        localStorage.setItem("trash", JSON.stringify(updated));
      }
      return { entries: updated };
    }),

  removeFromTrash: (id) =>
    set((state) => {
      const updated = state.entries.filter((e) => e.id !== id);
      if (typeof window !== "undefined") {
        localStorage.setItem("trash", JSON.stringify(updated));
      }
      return { entries: updated };
    }),

  clearTrash: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("trash");
    }
    set({ entries: [] });
  },
}));
