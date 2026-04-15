"use client";

import { STATUS_COLORS } from "@/lib/utils/constants";

interface PipelineSummaryBarProps {
  counts: Record<string, number>;
}

const DISPLAY_STATUSES = [
  "Identified",
  "Researched",
  "Contacted",
  "Following Up",
  "Closed - Won",
];

export function PipelineSummaryBar({ counts }: PipelineSummaryBarProps) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-rs-border/70 bg-white/5 p-3 text-sm shadow-[0_10px_28px_rgba(9,4,26,0.22)]">
      {DISPLAY_STATUSES.map((status) => (
        <div key={status} className="flex items-center gap-2 rounded-full border border-rs-border/70 bg-black/10 px-3 py-1.5">
          <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />
          <span className="text-[#d8ccfb]">
            {status}: <span className="font-semibold text-rs-cream">{counts[status] || 0}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
