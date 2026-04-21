export type PipelineView = "table" | "board";

export interface PipelineTweaks {
  density: "compact" | "comfy" | "roomy";
  urgency: "off" | "subtle" | "loud";
  accent: "cyan" | "punch" | "sunset";
  neon: boolean;
  showDollars: boolean;
}

export const DEFAULT_TWEAKS: PipelineTweaks = {
  density: "comfy",
  urgency: "subtle",
  accent: "cyan",
  neon: true,
  showDollars: true,
};
