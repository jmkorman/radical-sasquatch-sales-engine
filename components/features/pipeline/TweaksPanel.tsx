"use client";

import { PipelineTweaks } from "@/types/pipeline";

export function TweaksPanel({
  tweaks,
  setTweaks,
  open,
  setOpen,
}: {
  tweaks: PipelineTweaks;
  setTweaks: (t: PipelineTweaks) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  if (!open) return null;
  const update = <K extends keyof PipelineTweaks>(k: K, v: PipelineTweaks[K]) =>
    setTweaks({ ...tweaks, [k]: v });

  return (
    <div
      style={{
        position: "fixed",
        right: 22,
        top: 120,
        zIndex: 40,
        width: 280,
        borderRadius: 16,
        border: "1px solid rgba(100,245,234,0.35)",
        background: "linear-gradient(180deg, rgba(26,15,69,0.96), rgba(16,7,38,0.98))",
        boxShadow: "0 30px 60px rgba(0,0,0,0.55), 0 0 24px rgba(100,245,234,0.12)",
        padding: 16,
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.32em",
            color: "#64f5ea",
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          Tweaks
        </div>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: "#bcaef0",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      <TweakRow label="Density">
        <SegChoice
          value={tweaks.density}
          options={[["compact", "Compact"], ["comfy", "Comfy"], ["roomy", "Roomy"]]}
          onChange={(v) => update("density", v as PipelineTweaks["density"])}
        />
      </TweakRow>

      <TweakRow label="Urgency">
        <SegChoice
          value={tweaks.urgency}
          options={[["off", "Off"], ["subtle", "Subtle"], ["loud", "Loud"]]}
          onChange={(v) => update("urgency", v as PipelineTweaks["urgency"])}
        />
      </TweakRow>

      <TweakRow label="Accent">
        <div style={{ display: "flex", gap: 6 }}>
          {(
            [["cyan", "#64f5ea"], ["punch", "#ff4f9f"], ["sunset", "#ffb321"]] as [
              PipelineTweaks["accent"],
              string
            ][]
          ).map(([k, c]) => (
            <button
              key={k}
              onClick={() => update("accent", k)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                border:
                  tweaks.accent === k
                    ? `2px solid ${c}`
                    : "1px solid rgba(73,48,140,0.7)",
                background: c,
                cursor: "pointer",
                boxShadow: tweaks.accent === k ? `0 0 12px ${c}88` : "none",
              }}
            />
          ))}
        </div>
      </TweakRow>

      <TweakRow label="Neon chrome">
        <Toggle value={tweaks.neon} onChange={(v) => update("neon", v)} />
      </TweakRow>

      <TweakRow label="Show $ weight">
        <Toggle value={tweaks.showDollars} onChange={(v) => update("showDollars", v)} />
      </TweakRow>

      <div
        style={{
          borderTop: "1px solid rgba(73,48,140,0.7)",
          marginTop: 10,
          paddingTop: 10,
          fontSize: 10.5,
          color: "#8c7fbd",
          lineHeight: 1.5,
        }}
      >
        Tweaks adjust the current view live.
      </div>
    </div>
  );
}

function TweakRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#bcaef0",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SegChoice({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        padding: 2,
        background: "rgba(16,7,38,0.7)",
        borderRadius: 8,
        border: "1px solid rgba(73,48,140,0.6)",
      }}
    >
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          style={{
            padding: "4px 9px",
            fontSize: 10.5,
            fontWeight: 600,
            border: "none",
            borderRadius: 6,
            background: value === k ? "rgba(100,245,234,0.18)" : "transparent",
            color: value === k ? "#64f5ea" : "#bcaef0",
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        border: "1px solid rgba(73,48,140,0.7)",
        background: value ? "rgba(100,245,234,0.25)" : "rgba(16,7,38,0.7)",
        position: "relative",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: value ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: value ? "#64f5ea" : "#8c7fbd",
          transition: "left 150ms ease",
          boxShadow: value ? "0 0 8px rgba(100,245,234,0.6)" : "none",
        }}
      />
    </button>
  );
}
