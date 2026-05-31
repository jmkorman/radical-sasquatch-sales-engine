"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface PendingReviewItem {
  id: string;
  account_name: string;
  tab: string;
  tab_slug: string;
  location: string | null;
  email: string | null;
  reason: string;
  confidence: number | null;
  created_at: string;
}

export function PendingReviewQueue() {
  const [items, setItems] = useState<PendingReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/accounts/review", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load review queue");
      const data = await res.json();
      setItems(data.pending ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await fetch("/api/accounts/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Pending Review
            {items.length > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full border border-rs-gold/40 bg-rs-gold/15 px-2 py-0.5 text-xs font-semibold text-rs-gold">
                {items.length}
              </span>
            )}
          </h3>
          <p className="text-sm text-gray-400">
            Auto-created accounts the matcher wasn&apos;t fully sure about. Approve to add them to
            the pipeline, or reject to discard.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="py-6 text-sm text-[#af9fe6]">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-rs-border/60 bg-black/10 px-3 py-4 text-sm text-[#d8ccfb]">
          Nothing waiting for review.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-rs-gold/30 bg-rs-gold/5 px-3 py-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-rs-cream break-words">
                      {item.account_name}
                    </span>
                    <span className="rounded-full border border-rs-border/60 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#af9fe6]">
                      {item.tab}
                    </span>
                    {item.confidence != null && (
                      <span className="text-xs text-[#af9fe6]">{item.confidence}% confident</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-[#d8ccfb] break-words">
                    {[item.email, item.location].filter(Boolean).join(" · ")}
                  </div>
                  {item.reason && (
                    <div className="mt-1 text-xs italic text-[#af9fe6] break-words">
                      {item.reason}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void act(item.id, "approve")}
                    className="rounded-lg border border-rs-gold/40 bg-rs-gold/10 px-2.5 py-1 text-[11px] font-semibold text-rs-gold hover:bg-rs-gold/20 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void act(item.id, "reject")}
                    className="rounded-lg border border-rs-punch/40 bg-rs-punch/10 px-2.5 py-1 text-[11px] font-semibold text-[#ffd6e8] hover:bg-rs-punch/20 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
