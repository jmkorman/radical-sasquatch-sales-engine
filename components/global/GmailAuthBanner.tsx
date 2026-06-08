"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Status = "ok" | "error" | "not_configured" | "unknown";

interface GmailStatus {
  status: Status;
  detail: string | null;
  email: string | null;
  checkedAt: string | null;
  hasToken: boolean;
  oauthClientConfigured: boolean;
}

const POLL_MS = 60_000;
const DISMISS_KEY = "rs-gmail-banner-dismissed-at";
// Re-show the banner this long after a dismissal so a forgotten broken
// connection doesn't stay invisible forever.
const DISMISS_TTL_MS = 60 * 60 * 1000; // 1 hour

function loadDismissedAt(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function saveDismissedAt(value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISMISS_KEY, String(value));
}

export function GmailAuthBanner() {
  const [data, setData] = useState<GmailStatus | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number>(0);

  useEffect(() => {
    setDismissedAt(loadDismissedAt());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch("/api/gmail/status", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as GmailStatus;
        if (!cancelled) setData(json);
      } catch {
        /* swallow — banner just won't update this tick */
      }
    }

    void fetchStatus();
    const interval = window.setInterval(fetchStatus, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchStatus();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, []);

  if (!data) return null;

  // 'ok' and 'unknown' (never probed) -> no banner. Only flag actively bad
  // states the user can do something about.
  const broken = data.status === "error";
  const notConnected = data.status === "not_configured";
  if (!broken && !notConnected) return null;

  // If the OAuth client itself isn't configured we can't offer Connect; tell
  // the user what's missing instead.
  if (notConnected && !data.oauthClientConfigured) {
    if (Date.now() - dismissedAt < DISMISS_TTL_MS) return null;
    return (
      <Banner
        tone="warn"
        title="Gmail not configured"
        body="GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET are missing. Email polling, sending, and the Gmail thread view are disabled until they're set in your environment."
        onDismiss={() => {
          const now = Date.now();
          setDismissedAt(now);
          saveDismissedAt(now);
        }}
      />
    );
  }

  // Broken or missing token — both fixable from Settings.
  if (Date.now() - dismissedAt < DISMISS_TTL_MS && !broken) return null;

  const title = broken
    ? "Gmail connection broken"
    : "Gmail not connected";
  const body = broken
    ? `Email polling has stopped. The refresh token was rejected: ${data.detail ?? "auth error"}.`
    : "No Gmail refresh token on file. Connect Gmail to start polling sent and inbox messages.";

  return (
    <Banner
      tone={broken ? "error" : "warn"}
      title={title}
      body={body}
      cta={{ href: "/settings", label: "Reconnect Gmail" }}
      onDismiss={
        broken
          ? undefined // do not allow dismissing a hard failure
          : () => {
              const now = Date.now();
              setDismissedAt(now);
              saveDismissedAt(now);
            }
      }
    />
  );
}

function Banner({
  tone,
  title,
  body,
  cta,
  onDismiss,
}: {
  tone: "error" | "warn";
  title: string;
  body: string;
  cta?: { href: string; label: string };
  onDismiss?: () => void;
}) {
  const palette =
    tone === "error"
      ? "border-rs-punch/60 bg-rs-punch/15 text-[#ffd6e8]"
      : "border-amber-400/40 bg-amber-400/10 text-amber-100";
  const ctaPalette =
    tone === "error"
      ? "bg-rs-punch/30 hover:bg-rs-punch/40 text-white"
      : "bg-amber-400/25 hover:bg-amber-400/35 text-amber-50";

  return (
    <div className="sticky top-[64px] z-20 px-4 pt-3">
      <div
        className={`max-w-7xl mx-auto flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-[0_4px_24px_rgba(0,0,0,0.35)] ${palette}`}
      >
        <div className="flex-1 min-w-0">
          <div className="font-semibold uppercase tracking-[0.16em] text-xs mb-1">{title}</div>
          <div className="text-sm leading-snug">{body}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {cta && (
            <Link
              href={cta.href}
              className={`text-xs font-semibold uppercase tracking-[0.16em] px-3 py-1.5 rounded-lg ${ctaPalette}`}
            >
              {cta.label}
            </Link>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-xl leading-none px-2 opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
