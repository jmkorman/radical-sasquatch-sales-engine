"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EmailTemplate, DEFAULT_TEMPLATES } from "@/lib/templates/emailTemplates";

// Initialize state from localStorage synchronously on module load
const loadTemplateInitialState = () => {
  if (typeof window === "undefined") return { templates: DEFAULT_TEMPLATES };
  try {
    const stored = localStorage.getItem("rs-email-templates");
    if (!stored) return { templates: DEFAULT_TEMPLATES };
    const parsed = JSON.parse(stored);
    return parsed.state || { templates: DEFAULT_TEMPLATES };
  } catch {
    return { templates: DEFAULT_TEMPLATES };
  }
};

const templateInitialState = loadTemplateInitialState();

interface TemplateStore {
  templates: EmailTemplate[];
  loadDefaults: () => void;
  updateTemplate: (key: string, updates: Partial<EmailTemplate>) => void;
}

export const useTemplateStore = create<TemplateStore>()(
  persist(
    (set) => ({
      templates: templateInitialState.templates,
      loadDefaults: () => set({ templates: DEFAULT_TEMPLATES }),
      updateTemplate: (key, updates) =>
        set((state) => ({
          templates: state.templates.map((t) =>
            t.key === key ? { ...t, ...updates } : t
          ),
        })),
    }),
    { name: "rs-email-templates" }
  )
);
