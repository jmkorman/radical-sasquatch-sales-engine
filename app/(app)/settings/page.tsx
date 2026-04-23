"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useSheetStore } from "@/stores/useSheetStore";
import { CHANNEL_URGENCY_THRESHOLDS } from "@/lib/utils/constants";

type EnvStatus = {
  googleSheets: boolean;
  supabase: boolean;
  gmail: boolean;
};

export default function SettingsPage() {
  const { fetchAllTabs, syncStatus } = useSheetStore();
  const [connecting, setConnecting] = useState(false);
  const [gmailUrl, setGmailUrl] = useState<string | null>(null);
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEnvStatus() {
      try {
        const res = await fetch("/api/env/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setEnvStatus(data);
      } catch {
        if (!cancelled) setEnvStatus(null);
      }
    }

    loadEnvStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConnectGmail() {
    setConnecting(true);
    try {
      const res = await fetch("/api/gmail/connect");
      const data = await res.json();
      if (data.url) {
        setGmailUrl(data.url);
      } else {
        alert(data.error || "Could not generate Gmail auth URL. Check that GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are set in .env.local.");
      }
    } catch {
      alert("Failed to connect to Gmail. Check server logs.");
    } finally {
      setConnecting(false);
    }
  }

  const channels = [
    { key: "restaurants", label: "Restaurants / Bars / Breweries" },
    { key: "retail", label: "Retail" },
    { key: "catering", label: "Catering" },
    { key: "food-truck", label: "Food Trucks" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black uppercase tracking-[0.1em] text-rs-gold">Settings</h2>
        <p className="text-sm text-[#d8ccfb] mt-1">Configuration, integrations, and urgency thresholds.</p>
      </div>

      {/* Data Sync */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-1">Google Sheets Sync</h3>
        <p className="text-sm text-gray-400 mb-3">
          Manually refresh all pipeline data from your Google Sheet. Auto-syncs every 30 seconds.
        </p>
        <Button
          onClick={() => void fetchAllTabs()}
          disabled={syncStatus === "syncing"}
        >
          {syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
        </Button>
      </Card>

      {/* Gmail Email Tracking */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-1">Gmail Email Tracking</h3>
        <p className="text-sm text-gray-400 mb-4">
          Connect your Gmail to automatically show email threads for each account inside the account detail page.
          Read-only — the app will never send email or modify your inbox.
        </p>

        <div className="rounded-lg border border-rs-border/60 bg-black/20 p-4 mb-4 text-sm space-y-3">
          <div className="font-semibold text-[#d8ccfb]">Setup Instructions</div>
          <ol className="list-decimal list-inside space-y-2 text-gray-400">
            <li>
              Go to{" "}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="text-rs-gold underline"
              >
                Google Cloud Console → APIs &amp; Services → Credentials
              </a>
            </li>
            <li>Create an OAuth 2.0 Client ID (application type: Web application)</li>
            <li>
              Add this to Authorized Redirect URIs:{" "}
              <code className="bg-rs-surface px-1.5 py-0.5 rounded text-[#d8ccfb]">
                http://localhost:3000/api/gmail/auth
              </code>
              {" "}(and your production URL when deploying)
            </li>
            <li>
              Copy the Client ID and Secret into{" "}
              <code className="bg-rs-surface px-1.5 py-0.5 rounded text-[#d8ccfb]">.env.local</code>:
              <pre className="mt-2 bg-rs-surface rounded p-3 text-xs text-[#d8ccfb] overflow-x-auto">
{`GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REDIRECT_URI=http://localhost:3000/api/gmail/auth`}
              </pre>
            </li>
            <li>Restart your dev server, then click &quot;Connect Gmail&quot; below</li>
            <li>Copy the <code className="bg-rs-surface px-1.5 py-0.5 rounded text-[#d8ccfb]">GMAIL_REFRESH_TOKEN</code> shown after authorization into <code className="bg-rs-surface px-1.5 py-0.5 rounded text-[#d8ccfb]">.env.local</code> and restart again</li>
          </ol>
        </div>

        {gmailUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-[#d8ccfb]">
              Click the link below to authorize Gmail access. After authorizing, copy the refresh token shown on the next page into <code className="bg-rs-surface px-1.5 py-0.5 rounded">.env.local</code>.
            </p>
            <a
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 rounded-lg bg-rs-gold text-rs-bg font-semibold text-sm hover:bg-rs-gold-dark transition-colors"
            >
              Authorize Gmail Access →
            </a>
          </div>
        ) : (
          <Button onClick={handleConnectGmail} disabled={connecting}>
            {connecting ? "Generating auth URL..." : "Connect Gmail"}
          </Button>
        )}
      </Card>

      {/* Channel Urgency Thresholds */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-1">Channel Urgency Thresholds</h3>
        <p className="text-sm text-gray-400 mb-4">
          These control when contact temperature changes from Hot → Warm → Cooling → Stale, calibrated per channel.
          Edit in <code className="bg-rs-surface px-1.5 py-0.5 rounded text-[#d8ccfb]">lib/utils/constants.ts</code> → <code className="bg-rs-surface px-1.5 py-0.5 rounded text-[#d8ccfb]">CHANNEL_URGENCY_THRESHOLDS</code>.
        </p>
        <div className="space-y-3">
          {channels.map(({ key, label }) => {
            const t = CHANNEL_URGENCY_THRESHOLDS[key];
            return (
              <div
                key={key}
                className="rounded-lg border border-rs-border/60 bg-black/10 px-4 py-3"
              >
                <div className="text-sm font-semibold text-rs-cream mb-2">{label}</div>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <Threshold label="Hot" days={t.hot} color="#4ade80" />
                  <Threshold label="Warm" days={t.warm} color="#86efac" />
                  <Threshold label="Cooling" days={t.cooling} color="#facc15" />
                  <Threshold label="Stale" days={t.stale} color="#ff5f5f" />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Environment Status */}
      <Card>
        <h3 className="text-lg font-semibold text-white mb-3">Environment Status</h3>
        <p className="mb-3 text-sm text-gray-400">
          Checked server-side so private keys and service credentials show accurately without exposing them.
        </p>
        <div className="text-sm space-y-2">
          <EnvRow label="Google Sheets" configured={envStatus?.googleSheets} />
          <EnvRow label="Supabase" configured={envStatus?.supabase} />
          <EnvRow label="Gmail Tracking" configured={envStatus?.gmail} />
        </div>
      </Card>
    </div>
  );
}

function Threshold({ label, days, color }: { label: string; days: number; color: string }) {
  return (
    <div>
      <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-0.5">{label}</div>
      <div style={{ color }} className="font-bold text-sm">{`≤ ${days}d`}</div>
    </div>
  );
}

function EnvRow({ label, configured }: { label: string; configured: boolean | undefined }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          configured === true
            ? "bg-green-900/40 text-green-400"
            : configured === false
            ? "bg-red-900/40 text-red-400"
            : "bg-rs-surface/60 text-[#8c7fbd]"
        }`}
      >
        {configured === true ? "Connected" : configured === false ? "Not set" : "Checking..."}
      </span>
    </div>
  );
}
