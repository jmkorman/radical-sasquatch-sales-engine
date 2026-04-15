"use client";

import { create } from "zustand";
import { AnyAccount } from "@/types/accounts";

interface UIStore {
  logOutreachTarget: AnyAccount | null;
  openLogModal: (account: AnyAccount) => void;
  closeLogModal: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  logOutreachTarget: null,
  openLogModal: (account) => set({ logOutreachTarget: account }),
  closeLogModal: () => set({ logOutreachTarget: null }),
}));
