"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface RunResult {
  processed: number;
  ai: number;
  fallback: number;
  errors: number;
  remaining: number;
  totalCandidates: number;
  sampleResults: Array<{ id: string; summary: string; source: string }>;
}

interface DryRunResult {
  dryRun: true;
  totalCandidates: number;
  wouldProcess: number;
}

export function GmailLogCleanup() {
  const [scanning, setScanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [scan, setScan] = useState<DryRunResult | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doDryRun() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/gmail/cleanup-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      const data: DryRunResult = await res.json();
      setScan(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function doRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/gmail/cleanup-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 60 }),
      });
      if (!res.ok) throw new Error(`Cleanup failed (${res.status})`);
      const data: RunResult = await res.json();
      setResult(data);
      // Refresh the candidate count after the run
      void doDryRun();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <h3 className="text-lg font-semibold text-white mb-1">Legacy Gmail Log Cleanup</h3>
      <p className="text-sm text-gray-400 mb-3">
        Rewrites old auto-imported Gmail logs that contain the full email thread, replacing the body with a one-sentence
        AI summary in the same format new logs use. Subject and Gmail markers are preserved. Processes up to 60 logs per click.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <Button size="sm" variant="secondary" onClick={() => void doDryRun()} disabled={scanning || running}>
          {scanning ? "Scanning…" : "Scan for legacy logs"}
        </Button>
        <Button
          size="sm"
          onClick={() => void doRun()}
          disabled={running || scanning || (scan !== null && scan.totalCandidates === 0)}
        >
          {running ? "Summarizing…" : "Summarize next batch"}
        </Button>
      </div>

      {scan && (
        <div className="rounded-xl border border-rs-border/60 bg-black/10 px-3 py-2 mb-3 text-sm text-[#d8ccfb]">
          {scan.totalCandidates === 0 ? (
            <span>No legacy logs need cleanup. You&apos;re clean.</span>
          ) : (
            <span>
              Found <strong className="text-rs-cream">{scan.totalCandidates}</strong> legacy log{scan.totalCandidates === 1 ? "" : "s"}
              {" "}to summarize. Next batch: <strong className="text-rs-cream">{scan.wouldProcess}</strong>.
            </span>
          )}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-rs-cyan/30 bg-rs-cyan/5 px-3 py-2 mb-3 text-sm text-[#d8ccfb] space-y-1">
          <div>
            Processed <strong className="text-rs-cream">{result.processed}</strong> log{result.processed === 1 ? "" : "s"}
            {" "}— {result.ai} via AI, {result.fallback} via fallback, {result.errors} errors.
          </div>
          {result.remaining > 0 && (
            <div className="text-xs text-[#af9fe6]">
              {result.remaining} more remaining. Click again to continue.
            </div>
          )}
          {result.sampleResults.length > 0 && (
            <div className="mt-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[#af9fe6] mb-1">Sample summaries</div>
              <ul className="space-y-1">
                {result.sampleResults.map((s) => (
                  <li key={s.id} className="text-xs text-[#d8ccfb]">
                    <span className="text-[#af9fe6]">[{s.source}]</span> {s.summary}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rs-punch/40 bg-rs-punch/10 px-3 py-2 text-sm text-[#ffd6e8]">
          {error}
        </div>
      )}
    </Card>
  );
}
