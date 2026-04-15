"use client";

import { SyncStatus } from "@/types/sheets";

interface SyncIndicatorProps {
  status: SyncStatus;
  lastSynced: Date | null;
}

export function SyncIndicator({ status, lastSynced }: SyncIndicatorProps) {
  const dotColor =
    status === "syncing"
      ? "bg-rs-gold animate-pulse"
      : status === "error"
        ? "bg-rs-punch"
        : "bg-green-500";

  const label =
    status === "syncing"
      ? "Syncing..."
      : status === "error"
        ? "Sync error"
        : lastSynced
          ? `Synced ${lastSynced.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
          : "Not synced";

  return (
    <div className="flex items-center gap-1.5 text-xs text-[#d8ccfb]">
      <div className={`w-2 h-2 rounded-full ${dotColor}`} />
      <span>{label}</span>
    </div>
  );
}
