"use client";

import { useEffect, useState } from "react";

type Status = "ok" | "not_configured" | "error";
interface CheckResult { status: Status; detail?: string }
interface HealthResponse {
  checks: { supabase: CheckResult; sheets: CheckResult };
  checkedAt: string;
}

const POLL_MS = 60_000;
const DISMISS_KEY = "rs-system-health-dismissed";
// Bring the banner back after this long so a forgotten broken subsystem
// doesn't stay invisible. Errors are NEVER dismissable (only warns are).
const DISMISS_TTL_MS = 60 * 60 * 1000;

interface DismissRecord {
  // subsystem name -> timestamp of dismissal
  [subsystem: string]: number;
}

function loadDismissed(): DismissRecord {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as DismissRecord) : {};
  } catch {
    return {};
  }
}

function saveDismissed(record: DismissRecord) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISMISS_KEY, JSON.stringify(record));
}

export function SystemHealthBanner() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [dismissed, setDismissed] = useState<DismissRecord>({});

  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        const res = await fetch("/api/system-health", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as HealthResponse;
        if (!cancelled) setData(json);
      } catch {
        /* swallow */
      }
    }

    void fetchHealth();
    const interval = window.setInterval(fetchHealth, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchHealth();
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

  const items: Array<{
    key: "supabase" | "sheets";
    title: string;
    body: string;
    tone: "error" | "warn";
    dismissable: boolean;
  }> = [];

  if (data.checks.supabase.status === "error") {
    items.push({
      key: "supabase",
      title: "Supabase connection broken",
      body: `Database reads/writes are failing: ${data.checks.supabase.detail ?? "unknown error"}. Account/event/order changes will not persist.`,
      tone: "error",
      dismissable: false,
    });
  }

  if (data.checks.sheets.status === "not_configured") {
    items.push({
      key: "sheets",
      title: "Google Sheets not configured",
      body: "GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_SHEET_ID are missing. Sheets sync is disabled.",
      tone: "warn",
      dismissable: true,
    });
  } else if (data.checks.sheets.status === "error") {
    items.push({
      key: "sheets",
      title: "Google Sheets sync broken",
      body: `Sheet writes are failing: ${data.checks.sheets.detail ?? "unknown error"}.`,
      tone: "error",
      dismissable: false,
    });
  }

  const now = Date.now();
  const visible = items.filter((item) => {
    if (!item.dismissable) return true;
    return now - (dismissed[item.key] ?? 0) >= DISMISS_TTL_MS;
  });

  if (visible.length === 0) return null;

  return (
    <div className="sticky top-[64px] z-20 px-4 pt-3 space-y-2">
      {visible.map((item) => (
        <Banner
          key={item.key}
          tone={item.tone}
          title={item.title}
          body={item.body}
          onDismiss={
            item.dismissable
              ? () => {
                  const next = { ...dismissed, [item.key]: Date.now() };
                  setDismissed(next);
                  saveDismissed(next);
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function Banner({
  tone,
  title,
  body,
  onDismiss,
}: {
  tone: "error" | "warn";
  title: string;
  body: string;
  onDismiss?: () => void;
}) {
  const palette =
    tone === "error"
      ? "border-rs-punch/60 bg-rs-punch/15 text-[#ffd6e8]"
      : "border-amber-400/40 bg-amber-400/10 text-amber-100";

  return (
    <div
      className={`max-w-7xl mx-auto flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-[0_4px_24px_rgba(0,0,0,0.35)] ${palette}`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-semibold uppercase tracking-[0.16em] text-xs mb-1">{title}</div>
        <div className="text-sm leading-snug">{body}</div>
      </div>
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
  );
}
