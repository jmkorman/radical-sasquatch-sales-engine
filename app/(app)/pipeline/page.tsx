"use client";

import { useSheetStore } from "@/stores/useSheetStore";
import { PipelineTable } from "@/components/features/pipeline/PipelineTable";
import { Spinner } from "@/components/ui/Spinner";

export default function PipelinePage() {
  const { data } = useSheetStore();

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-white">Pipeline</h2>
      <PipelineTable data={data} />
    </div>
  );
}
