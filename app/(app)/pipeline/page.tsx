"use client";

import { useSheetStore } from "@/stores/useSheetStore";
import { Spinner } from "@/components/ui/Spinner";
import { ViewSwitcher } from "@/components/features/pipeline/ViewSwitcher";
import { CommandTable } from "@/components/features/pipeline/CommandTable";
import { StageBoard } from "@/components/features/pipeline/StageBoard";
import { HotList } from "@/components/features/pipeline/HotList";
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
      </div>

      {view === "table" && <CommandTable data={data} tweaks={TWEAKS} />}
      {view === "board" && <StageBoard data={data} tweaks={TWEAKS} />}
      {view === "hot"   && <HotList   data={data} tweaks={TWEAKS} />}
    </div>
  );
}
