"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { NavBar } from "@/components/layout/NavBar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { useSheetStore } from "@/stores/useSheetStore";
import { tryAcquireGmailPollLock, releaseGmailPollLock } from "@/lib/gmail/clientPollLock";

const GMAIL_POPUP_SEEN_KEY = "rs-gmail-popup-seen-log-ids";

function loadSeenGmailPopupIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(GMAIL_POPUP_SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((value) => typeof value === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenGmailPopupIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GMAIL_POPUP_SEEN_KEY, JSON.stringify(Array.from(ids)));
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const fetchAllTabs = useSheetStore((state) => state.fetchAllTabs);
  const [reviewAccounts, setReviewAccounts] = useState<string[]>([]);
  const [reviewPath, setReviewPath] = useState<string>("/logs");

  useEffect(() => {
    void fetchAllTabs();

    const refreshSilently = () => {
      if (document.visibilityState !== "visible") return;
      void fetchAllTabs({ silent: true });
    };

    const pollGmail = () => {
      if (document.visibilityState !== "visible") return;
      if (!tryAcquireGmailPollLock()) return;
      fetch("/api/gmail/poll")
        .then((r) => (r.ok ? r.json() : null))
        .then((result: {
          imported?: number;
          importedAccounts?: string[];
          importedAccountPaths?: string[];
          importedLogIds?: string[];
        } | null) => {
          if (result?.imported && result.imported > 0) {
            void fetchAllTabs({ silent: true });
            const newAccounts = (result.importedAccounts ?? []).filter(Boolean);
            const newPaths = (result.importedAccountPaths ?? []).filter(Boolean);
            const newLogIds = result.importedLogIds ?? [];
            const seenPopupIds = loadSeenGmailPopupIds();
            const unseenIndexes = newLogIds
              .map((id, index) => ({ id, index }))
              .filter(({ id }) => id && !seenPopupIds.has(id));

            if (unseenIndexes.length) {
              for (const { id } of unseenIndexes) seenPopupIds.add(id);
              saveSeenGmailPopupIds(seenPopupIds);

              const firstUnseen = unseenIndexes[0];
              const unseenAccounts = unseenIndexes
                .map(({ index }) => newAccounts[index])
                .filter(Boolean);
              const firstPath = newPaths[firstUnseen.index] && firstUnseen.id
                ? `${newPaths[firstUnseen.index]}?reviewLog=${encodeURIComponent(firstUnseen.id)}`
                : newPaths[firstUnseen.index] ?? "/logs";
              setReviewPath(firstPath);
              setReviewAccounts((prev) => Array.from(new Set([...prev, ...unseenAccounts])));
            }
          }
        })
        .catch(() => {})
        .finally(() => { releaseGmailPollLock(); });
    };

    const interval = window.setInterval(refreshSilently, 30000);
    window.addEventListener("focus", refreshSilently);
    document.addEventListener("visibilitychange", refreshSilently);

    // Poll Gmail: on mount (after 5s), every 60s, and whenever window regains focus
    const gmailTimeout = window.setTimeout(pollGmail, 5000);
    const gmailInterval = window.setInterval(pollGmail, 60 * 1000);
    window.addEventListener("focus", pollGmail);
    document.addEventListener("visibilitychange", pollGmail);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshSilently);
      document.removeEventListener("visibilitychange", refreshSilently);
      window.clearTimeout(gmailTimeout);
      window.clearInterval(gmailInterval);
      window.removeEventListener("focus", pollGmail);
      document.removeEventListener("visibilitychange", pollGmail);
    };
  }, [fetchAllTabs]);

  const dismissReview = () => {
    setReviewAccounts([]);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-rs-bg flex flex-col">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_left,_rgba(100,245,234,0.14),_transparent_36%),radial-gradient(circle_at_top_right,_rgba(255,79,159,0.18),_transparent_40%)]" />
      <Header />
      <NavBar />
      <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full px-4 py-6 pb-20 sm:pb-6">
        {children}
      </main>
      <CommandPalette />

      {reviewAccounts.length > 0 && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 z-50 w-72 bg-rs-surface border border-rs-gold/30 rounded-2xl p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-rs-gold text-sm font-semibold">Email logged</p>
              <p className="text-white/80 text-xs mt-1 leading-snug truncate">
                {reviewAccounts.slice(0, 2).join(", ")}
                {reviewAccounts.length > 2 ? ` +${reviewAccounts.length - 2} more` : ""}
              </p>
              <p className="text-white/45 text-xs mt-0.5">Add a follow-up date while it&apos;s fresh.</p>
            </div>
            <button
              onClick={dismissReview}
              className="text-white/35 hover:text-white/70 text-xl leading-none shrink-0"
              aria-label="Dismiss"
            >×</button>
          </div>
          <div className="flex gap-2 mt-3">
            <Link
              href={reviewPath}
              onClick={dismissReview}
              className="flex-1 text-center text-xs py-1.5 rounded-lg bg-rs-gold/15 text-rs-gold hover:bg-rs-gold/25 transition-colors font-medium"
            >
              Review email
            </Link>
            <button
              onClick={dismissReview}
              className="text-xs py-1.5 px-3 rounded-lg text-white/40 hover:text-white/65 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
