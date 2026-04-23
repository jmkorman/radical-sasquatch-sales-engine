"use client";

import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { NavBar } from "@/components/layout/NavBar";
import { useSheetStore } from "@/stores/useSheetStore";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const fetchAllTabs = useSheetStore((state) => state.fetchAllTabs);

  useEffect(() => {
    void fetchAllTabs();

    const refreshSilently = () => {
      if (document.visibilityState !== "visible") return;
      void fetchAllTabs({ silent: true });
    };

    let lastGmailPollAt = 0;
    const pollGmail = () => {
      if (document.visibilityState !== "visible") return;
      // Throttle: don't poll more than once every 10s
      const now = Date.now();
      if (now - lastGmailPollAt < 10_000) return;
      lastGmailPollAt = now;
      fetch("/api/gmail/poll")
        .then((r) => (r.ok ? r.json() : null))
        .then((result) => {
          if (result?.imported > 0) {
            void fetchAllTabs({ silent: true });
          }
        })
        .catch(() => {});
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-rs-bg flex flex-col">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_left,_rgba(100,245,234,0.14),_transparent_36%),radial-gradient(circle_at_top_right,_rgba(255,79,159,0.18),_transparent_40%)]" />
      <Header />
      <NavBar />
      <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full px-4 py-6 pb-20 sm:pb-6">
        {children}
      </main>
    </div>
  );
}
