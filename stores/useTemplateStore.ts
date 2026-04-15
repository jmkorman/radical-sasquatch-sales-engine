"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EmailTemplate, DEFAULT_TEMPLATES } from "@/lib/templates/emailTemplates";

interface TemplateStore {
  templates: EmailTemplate[];
  loadDefaults: () => void;
  updateTemplate: (key: string, updates: Partial<EmailTemplate>) => void;
}

export const useTemplateStore = create<TemplateStore>()(
  persist(
    (set) => ({
      templates: DEFAULT_TEMPLATES,
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
