"use client";

import { useSheetStore } from "@/stores/useSheetStore";
import { useUIStore } from "@/stores/useUIStore";
import { Spinner } from "@/components/ui/Spinner";
import { ViewSwitcher } from "@/components/features/pipeline/ViewSwitcher";
import { CommandTable } from "@/components/features/pipeline/CommandTable";
import { StageBoard } from "@/components/features/pipeline/StageBoard";
import { PipelineView, PipelineTweaks } from "@/types/pipeline";
import { useState } from "react";

const TWEAKS: PipelineTweaks = {
  density: "comfy",
  urgency: "loud",
  accent: "cyan",
  neon: true,
  showDollars: false,
};

export default function PipelinePage() {
  const { data } = useSheetStore();
  const [view, setView] = useState<PipelineView>("table");
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);

  const handleSetValidation = async () => {
    try {
      const res = await fetch("/api/sheets/set-validation", { method: "POST" });
      if (res.ok) {
        showActionFeedback("Stage dropdowns synced to Google Sheet.", "success");
      } else {
        showActionFeedback("Failed to sync stage dropdowns.", "error");
      }
    } catch {
      showActionFeedback("Failed to sync stage dropdowns.", "error");
    }
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <ViewSwitcher view={view} setView={setView} />
        <button
          onClick={handleSetValidation}
          style={{
            marginLeft: "auto",
            padding: "6px 14px",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 8,
            border: "1px solid rgba(100,245,234,0.35)",
            background: "rgba(100,245,234,0.07)",
            color: "#64f5ea",
            cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Sync Sheet Stage Dropdowns
        </button>
      </div>

      {view === "table" && <CommandTable data={data} tweaks={TWEAKS} />}
      {view === "board" && <StageBoard data={data} tweaks={TWEAKS} />}
    </div>
  );
}
