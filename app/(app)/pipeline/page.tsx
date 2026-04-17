"use client";

import { useState } from "react";
import { useSheetStore } from "@/stores/useSheetStore";
import { Spinner } from "@/components/ui/Spinner";
import { ViewSwitcher } from "@/components/features/pipeline/ViewSwitcher";
import { TweaksPanel } from "@/components/features/pipeline/TweaksPanel";
import { CommandTable } from "@/components/features/pipeline/CommandTable";
import { StageBoard } from "@/components/features/pipeline/StageBoard";
import { HotList } from "@/components/features/pipeline/HotList";
import { PipelineView, PipelineTweaks, DEFAULT_TWEAKS } from "@/types/pipeline";

export default function PipelinePage() {
  const { data } = useSheetStore();
  const [view, setView] = useState<PipelineView>("table");
  const [tweaks, setTweaks] = useState<PipelineTweaks>(DEFAULT_TWEAKS);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <ViewSwitcher view={view} setView={setView} />
        <button
          onClick={() => setTweaksOpen((v) => !v)}
          style={{
            padding: "9px 13px",
            borderRadius: 12,
            border: "1px solid rgba(73,48,140,0.7)",
            background: tweaksOpen ? "rgba(100,245,234,0.12)" : "rgba(255,255,255,0.04)",
            color: tweaksOpen ? "#64f5ea" : "#d8ccfb",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.2,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Tweaks
        </button>
      </div>

      <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} open={tweaksOpen} setOpen={setTweaksOpen} />

      {view === "table" && <CommandTable data={data} tweaks={tweaks} />}
      {view === "board" && <StageBoard data={data} tweaks={tweaks} />}
      {view === "hot"   && <HotList   data={data} tweaks={tweaks} />}
    </div>
  );
}
