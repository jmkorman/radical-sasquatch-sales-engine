"use client";

import { create } from "zustand";
import { AnyAccount } from "@/types/accounts";

interface ActionFeedback {
  message: string;
  tone: "success" | "error" | "info";
  timestamp: number;
  actionLabel?: string;
  action?: () => void;
}

interface UIStore {
  logOutreachTarget: AnyAccount | null;
  actionFeedback: ActionFeedback | null;
  openLogModal: (account: AnyAccount) => void;
  closeLogModal: () => void;
  showActionFeedback: (message: string, tone?: ActionFeedback["tone"]) => void;
  showActionFeedbackWithAction: (
    message: string,
    actionLabel: string,
    action: () => void,
    tone?: ActionFeedback["tone"]
  ) => void;
  clearActionFeedback: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  logOutreachTarget: null,
  actionFeedback: null,
  openLogModal: (account) => set({ logOutreachTarget: account }),
  closeLogModal: () => set({ logOutreachTarget: null }),
  showActionFeedback: (message, tone = "success") =>
    set({ actionFeedback: { message, tone, timestamp: Date.now() } }),
  showActionFeedbackWithAction: (message, actionLabel, action, tone = "info") =>
    set({
      actionFeedback: {
        message,
        tone,
        actionLabel,
        action,
        timestamp: Date.now(),
      },
    }),
  clearActionFeedback: () => set({ actionFeedback: null }),
}));
