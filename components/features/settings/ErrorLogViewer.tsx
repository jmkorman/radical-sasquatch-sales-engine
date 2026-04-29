"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface LoggedError {
  id: string;
  created_at: string;
  source: string;
  severity: "error" | "warn";
  message: string;
  details: Record<string, unknown> | null;
  acknowledged: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ErrorLogViewer() {
  const [errors, setErrors] = useState<LoggedError[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/errors", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load errors");
      const data = await res.json();
      setErrors(data.errors ?? []);
    } catch {
      setErrors([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function acknowledge(id: string) {
    await fetch("/api/errors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  async function acknowledgeAll() {
    await fetch("/api/errors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    await load();
  }

  const visible = errors.filter((e) => showAcknowledged || !e.acknowledged);
  const unackCount = errors.filter((e) => !e.acknowledged).length;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Error Log{unackCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full border border-rs-punch/40 bg-rs-punch/15 px-2 py-0.5 text-xs font-semibold text-[#ffd6e8]">
                {unackCount} new
              </span>
            )}
          </h3>
          <p className="text-sm text-gray-400">
            Silent failures from cron jobs, Gmail poll, and save paths get logged here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAcknowledged((v) => !v)}
            className="text-xs text-[#af9fe6] hover:text-rs-cream"
          >
            {showAcknowledged ? "Hide acknowledged" : "Show acknowledged"}
          </button>
          {unackCount > 0 && (
            <Button size="sm" variant="secondary" onClick={() => void acknowledgeAll()}>
              Mark all seen
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-sm text-[#af9fe6]">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-rs-border/60 bg-black/10 px-3 py-4 text-sm text-[#d8ccfb]">
          No errors. System is healthy.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((err) => (
            <div
              key={err.id}
              className={`rounded-xl border px-3 py-2 ${
                err.acknowledged
                  ? "border-rs-border/40 bg-black/10 opacity-60"
                  : "border-rs-punch/30 bg-rs-punch/5"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-rs-border/60 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#af9fe6]">
                      {err.source}
                    </span>
                    <span className="text-xs text-[#af9fe6]">{formatDate(err.created_at)}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-rs-cream break-words">
                    {err.message}
                  </div>
                  {err.details && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-rs-cyan hover:underline"
                      onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
                    >
                      {expandedId === err.id ? "Hide details" : "Show details"}
                    </button>
                  )}
                  {expandedId === err.id && err.details && (
                    <pre className="mt-2 max-h-60 overflow-auto rounded-lg border border-rs-border/60 bg-black/40 p-2 text-[11px] text-[#d8ccfb]">
                      {JSON.stringify(err.details, null, 2)}
                    </pre>
                  )}
                </div>
                {!err.acknowledged && (
                  <button
                    type="button"
                    onClick={() => void acknowledge(err.id)}
                    className="shrink-0 rounded-lg border border-rs-border/60 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-[#af9fe6] hover:border-rs-gold/40 hover:text-rs-gold"
                  >
                    Mark seen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
