"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSheetStore } from "@/stores/useSheetStore";
import { useUIStore } from "@/stores/useUIStore";
import { SyncIndicator } from "@/components/ui/SyncIndicator";
import { calculateCommission } from "@/lib/commission/calculator";
import { formatDate } from "@/lib/utils/dates";

export function Header() {
  const { data, syncStatus, lastSynced, fetchAllTabs } = useSheetStore();
  const { actionFeedback, clearActionFeedback } = useUIStore();
  const commission = data ? calculateCommission(data) : 0;

  useEffect(() => {
    if (!actionFeedback) return;
    const timeout = window.setTimeout(() => clearActionFeedback(), 4000);
    return () => window.clearTimeout(timeout);
  }, [actionFeedback, clearActionFeedback]);

  return (
    <header className="sticky top-0 z-30 border-b border-rs-border/80 bg-[linear-gradient(180deg,rgba(26,15,69,0.96),rgba(16,7,38,0.92))] backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-rs-border/70 bg-white/5 p-1 shadow-[0_0_28px_rgba(255,79,159,0.18)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/retro-logo.png"
                alt="Radical Sasquatch logo"
                className="h-full w-full object-contain p-1"
              />
            </div>

            <div className="hidden min-w-0 sm:block">
              <div className="text-[10px] uppercase tracking-[0.45em] text-rs-sunset/85">
                Radical Sasquatch
              </div>
              <h1 className="truncate text-sm font-black uppercase tracking-[0.24em] text-rs-gold sm:text-base">
                Sales Engine
              </h1>
              <p className="hidden text-xs text-[#d8ccfb] md:block">
                Daily control center for outreach, follow up, and wins
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden rounded-full border border-rs-border/70 bg-white/5 px-3 py-2 text-sm text-[#d8ccfb] md:block">
              {formatDate(new Date())}
            </div>

            <div className="rounded-2xl border border-rs-border/70 bg-white/5 px-3 py-2 text-right shadow-[0_0_20px_rgba(100,245,234,0.08)]">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#bcaef0]">
                Est. Commission
              </div>
              <div className="text-sm font-semibold text-rs-gold sm:text-base">
                ${commission.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-rs-border/70 bg-white/5 px-3 py-2">
              <div className="hidden sm:block">
                <SyncIndicator status={syncStatus} lastSynced={lastSynced} />
              </div>

              <button
                onClick={() => void fetchAllTabs()}
                disabled={syncStatus === "syncing"}
                className="text-[#d8ccfb] hover:text-rs-gold transition-colors disabled:opacity-50"
                title="Refresh data"
              >
                <svg className={`h-4 w-4 ${syncStatus === "syncing" ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {actionFeedback && (
          <div
            className={`mt-3 rounded-2xl border px-3 py-2 text-sm ${
              actionFeedback.tone === "error"
                ? "border-rs-punch/50 bg-rs-punch/10 text-[#ffd6e8]"
                : actionFeedback.tone === "info"
                  ? "border-rs-border/70 bg-white/5 text-[#d8ccfb]"
                  : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{actionFeedback.message}</span>
              {actionFeedback.actionLabel && actionFeedback.action && (
                <button
                  onClick={() => {
                    actionFeedback.action?.();
                    clearActionFeedback();
                  }}
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-rs-gold hover:text-rs-cream"
                >
                  {actionFeedback.actionLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
