"use client";

import { PipelineView } from "@/types/pipeline";

const ITEMS: { key: PipelineView; label: string; desc: string }[] = [
  { key: "table", label: "Command Table", desc: "Dense, urgency-sorted" },
  { key: "board", label: "Stage Board",   desc: "Kanban by status" },
];

export function ViewSwitcher({
  view,
  setView,
}: {
  view: PipelineView;
  setView: (v: PipelineView) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        padding: 4,
        borderRadius: 14,
        border: "1px solid rgba(73,48,140,0.7)",
        background: "rgba(16,7,38,0.5)",
        gap: 2,
      }}
    >
      {ITEMS.map((it) => {
        const active = view === it.key;
        return (
          <button
            key={it.key}
            onClick={() => setView(it.key)}
            title={it.desc}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "none",
              background: active
                ? "linear-gradient(180deg, rgba(100,245,234,0.18), rgba(100,245,234,0.06))"
                : "transparent",
              color: active ? "#64f5ea" : "#bcaef0",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
              boxShadow: active ? "inset 0 0 0 1px rgba(100,245,234,0.35)" : "none",
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
