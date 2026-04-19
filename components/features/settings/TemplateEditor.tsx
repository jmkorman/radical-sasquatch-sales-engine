"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DEFAULT_TEMPLATES, EmailTemplate } from "@/lib/templates/emailTemplates";
import { useUIStore } from "@/stores/useUIStore";

export function TemplateEditor() {
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);
  const [templates, setTemplates] = useState<EmailTemplate[]>(DEFAULT_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/settings/templates", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load templates");
        const data: EmailTemplate[] = await response.json();
        if (!active) return;
        setTemplates(data);
      } catch {
        if (!active) return;
        setTemplates(DEFAULT_TEMPLATES);
        showActionFeedback("Couldn’t load online email templates. Showing defaults.", "error");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current);
    };
  }, [showActionFeedback]);

  const persistTemplates = async (nextTemplates: EmailTemplate[]) => {
    setSaveState("saving");

    try {
      const response = await fetch("/api/settings/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: nextTemplates }),
      });
      if (!response.ok) throw new Error("Failed to save templates");

      const saved: EmailTemplate[] = await response.json();
      setTemplates(saved);
      setSaveState("saved");
      if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current);
      saveStateTimerRef.current = setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
      showActionFeedback("Couldn’t save email templates online.", "error");
    }
  };

  const queueSave = (nextTemplates: EmailTemplate[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistTemplates(nextTemplates);
    }, 700);
  };

  const updateTemplate = (key: string, updates: Partial<EmailTemplate>) => {
    setTemplates((existing) => {
      const nextTemplates = existing.map((template) =>
        template.key === key ? { ...template, ...updates } : template
      );
      queueSave(nextTemplates);
      return nextTemplates;
    });
  };

  const loadDefaults = () => {
    setTemplates(DEFAULT_TEMPLATES);
    queueSave(DEFAULT_TEMPLATES);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Email Templates</h3>
          <div className="text-xs text-[#cdbdff]">
            {loading
              ? "Loading templates..."
              : saveState === "saving"
                ? "Saving online..."
                : saveState === "saved"
                  ? "Saved online"
                  : saveState === "error"
                    ? "Online save failed"
                    : "Autosaves to the hosted app"}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={loadDefaults}>
          Reset to Defaults
        </Button>
      </div>

      {templates.map((template) => (
        <Card key={template.key}>
          <div className="space-y-3">
            <div className="text-sm font-medium text-rs-gold">{template.label}</div>
            <Input
              label="Subject"
              value={template.subject}
              onChange={(e) =>
                updateTemplate(template.key, { subject: e.target.value })
              }
            />
            <Textarea
              label="Body"
              value={template.body}
              onChange={(e) =>
                updateTemplate(template.key, { body: e.target.value })
              }
              rows={6}
            />
            <div className="text-xs text-gray-500">
              Available placeholders: {"{{contactName}}"}, {"{{accountName}}"}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
