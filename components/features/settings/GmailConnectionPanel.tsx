"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Status = "ok" | "error" | "not_configured" | "unknown";

interface GmailStatus {
  status: Status;
  detail: string | null;
  email: string | null;
  checkedAt: string | null;
  hasToken: boolean;
  oauthClientConfigured: boolean;
  tokenSource: "supabase" | "env" | null;
}

function formatChecked(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  return d.toLocaleString();
}

/**
 * Replaces the old static "Connect Gmail" card. Surfaces live auth status,
 * lets the user re-run the OAuth consent flow from the app (no env-var
 * editing / redeploy), and runs a manual probe via /api/gmail/status POST.
 */
export function GmailConnectionPanel() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function loadStatus() {
    try {
      const res = await fetch("/api/gmail/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as GmailStatus;
      setStatus(data);
    } catch {
      /* leave previous state */
    }
  }

  useEffect(() => {
    void loadStatus();
    const t = window.setInterval(loadStatus, 30_000);
    return () => window.clearInterval(t);
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/gmail/connect");
      const data = await res.json();
      if (data.url) setAuthUrl(data.url);
      else alert(data.error || "Could not generate Gmail auth URL.");
    } catch {
      alert("Failed to start Gmail connection. Check server logs.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/gmail/status", { method: "POST" });
      const data = await res.json();
      if (data.status === "ok") {
        setTestResult(`Connected — ${data.email ?? "Gmail responded successfully"}.`);
      } else if (data.status === "not_configured") {
        setTestResult("Gmail isn't configured yet.");
      } else {
        setTestResult(`Failed: ${data.error ?? "unknown error"}`);
      }
      void loadStatus();
    } catch (err) {
      setTestResult(`Test failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setTesting(false);
    }
  }

  const s = status?.status ?? "unknown";
  const pillClass =
    s === "ok"
      ? "bg-green-900/40 text-green-300"
      : s === "error"
        ? "bg-rs-punch/30 text-[#ffd6e8]"
        : s === "not_configured"
          ? "bg-amber-400/20 text-amber-200"
          : "bg-rs-surface/60 text-[#8c7fbd]";
  const pillLabel =
    s === "ok"
      ? "Connected"
      : s === "error"
        ? "Broken"
        : s === "not_configured"
          ? "Not connected"
          : "Unknown";

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-lg font-semibold text-white">Gmail Connection</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pillClass}`}>
          {pillLabel}
        </span>
      </div>
      <p className="text-sm text-gray-400 mb-3">
        Read-only access for email polling, account attribution, and thread display. The refresh
        token lives in Supabase (<code className="bg-rs-surface px-1 py-0.5 rounded text-[#d8ccfb]">app_credentials</code>) so
        reconnecting here takes effect immediately — no env-var edit, no redeploy.
      </p>

      <div className="rounded-lg border border-rs-border/60 bg-black/20 p-3 text-xs space-y-1 mb-4">
        <Row label="Account" value={status?.email ?? "—"} />
        <Row label="Last checked" value={formatChecked(status?.checkedAt ?? null)} />
        <Row label="Token source" value={status?.tokenSource ?? "—"} />
        {status?.status === "error" && status.detail && (
          <Row label="Last error" value={status.detail} mono />
        )}
      </div>

      {!status?.oauthClientConfigured && (
        <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-100">
          <strong>OAuth client missing.</strong> Set <code>GMAIL_CLIENT_ID</code> and{" "}
          <code>GMAIL_CLIENT_SECRET</code> in your environment first — those still live in env vars
          (only the refresh token moved to the DB).
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleConnect} disabled={connecting || !status?.oauthClientConfigured}>
          {connecting
            ? "Preparing auth URL..."
            : status?.hasToken
              ? "Reconnect Gmail"
              : "Connect Gmail"}
        </Button>
        <Button
          onClick={handleTest}
          disabled={testing || !status?.oauthClientConfigured || !status?.hasToken}
        >
          {testing ? "Testing..." : "Test Connection"}
        </Button>
      </div>

      {authUrl && (
        <div className="mt-4 rounded-lg border border-rs-border/60 bg-black/20 p-3 text-sm space-y-2">
          <p className="text-[#d8ccfb]">
            Click below to authorize. Google will redirect back here and the new refresh token will
            be saved to Supabase automatically.
          </p>
          <a
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-4 py-2 rounded-lg bg-rs-gold text-rs-bg font-semibold text-sm hover:bg-rs-gold-dark transition-colors"
          >
            Authorize Gmail Access →
          </a>
          <p className="text-xs text-[#8c7fbd]">
            If Google says &ldquo;already authorized&rdquo; / returns no refresh token, revoke at{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
              className="text-rs-gold underline"
            >
              myaccount.google.com/permissions
            </a>{" "}
            and try again.
          </p>
        </div>
      )}

      {testResult && (
        <div className="mt-3 text-xs text-[#d8ccfb]">{testResult}</div>
      )}
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[#8c7fbd] uppercase tracking-[0.16em] w-28 shrink-0">{label}</span>
      <span className={`text-[#d8ccfb] break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
