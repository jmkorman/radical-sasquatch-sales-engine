"use client";

import { STATUS_PALETTE } from "@/lib/pipeline/urgency";

export function StatusDot({
  status,
  size = 8,
  glow = false,
}: {
  status: string;
  size?: number;
  glow?: boolean;
}) {
  const c = STATUS_PALETTE[status] ?? STATUS_PALETTE[""];
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: 999,
        background: c.base,
        boxShadow: glow ? `0 0 10px ${c.glow}, 0 0 2px ${c.glow}` : "none",
        flexShrink: 0,
      }}
    />
  );
}

export function StatusPill({
  status,
  size = "sm",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const c = STATUS_PALETTE[status] ?? STATUS_PALETTE[""];
  const label = status || "No status";
  const pad = size === "sm" ? "3px 9px" : "5px 12px";
  const fs = size === "sm" ? 10.5 : 12;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: pad,
        borderRadius: 999,
        background: `color-mix(in oklch, ${c.base} 18%, transparent)`,
        color: c.ink,
        border: `1px solid color-mix(in oklch, ${c.base} 45%, transparent)`,
        fontSize: fs,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        fontFamily: "'Space Grotesk', sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      <StatusDot status={status} size={6} glow />
      {label}
    </span>
  );
}
