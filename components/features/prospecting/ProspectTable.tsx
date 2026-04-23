"use client";

import { useMemo, useState } from "react";
import { Prospect, ProspectFinderBucket } from "@/types/prospects";
import { TabName } from "@/types/accounts";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";
import { SearchBar } from "@/components/ui/SearchBar";
import { useSheetStore } from "@/stores/useSheetStore";
import { useUIStore } from "@/stores/useUIStore";

interface ProspectTableProps {
  prospects: Prospect[];
  buckets: ProspectFinderBucket[];
  onRefresh: () => void;
}

const STATUS_FILTERS = [
  { value: "open", label: "Open" },
  { value: "triggered", label: "Triggered" },
  { value: "enriched", label: "Enriched" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

function channelToTab(channel?: string | null): TabName {
  const normalized = (channel ?? "").toLowerCase();
  if (normalized.includes("retail") || normalized.includes("grocery")) return "Retail";
  if (normalized.includes("cater") || normalized.includes("event") || normalized.includes("wedding") || normalized.includes("corporate")) return "Catering";
  if (normalized.includes("food truck")) return "Food Truck";
  if (normalized.includes("active")) return "Active Accounts";
  return "Restaurants";
}

function stalenessColor(createdAt: string): string {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days <= 7) return "#64f5ea";
  if (days <= 21) return "#ffb321";
  return "#ff4f9f";
}

function stalenessLabel(createdAt: string): string {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d";
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

function statusLabel(prospect: Prospect) {
  if (prospect.added_to_sheet || prospect.status === "approved") return "Approved";
  if (prospect.status === "rejected") return "Rejected";
  if (prospect.trigger_type || prospect.status === "triggered") return "Triggered";
  if (prospect.last_enriched_at || prospect.status === "enriched") return "Enriched";
  return "New";
}

export function ProspectTable({ prospects, buckets, onRefresh }: ProspectTableProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [running, setRunning] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [form, setForm] = useState({
    business_name: "",
    type: "",
    channel: "Restaurants",
    address: "",
    website: "",
    instagram: "",
    notes: "",
    source_url: "",
    research_query: "",
    source: "manual",
  });

  const { fetchAllTabs } = useSheetStore();
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);

  const openProspects = prospects.filter((prospect) => !prospect.added_to_sheet && prospect.status !== "rejected");
  const triggeredCount = prospects.filter((prospect) => prospect.trigger_type && !prospect.added_to_sheet && prospect.status !== "rejected").length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects
      .filter((prospect) => {
        if (status === "open") return !prospect.added_to_sheet && prospect.status !== "rejected";
        if (status === "approved") return prospect.added_to_sheet || prospect.status === "approved";
        if (status === "triggered") return Boolean(prospect.trigger_type) && prospect.status !== "rejected";
        if (status === "enriched") return Boolean(prospect.last_enriched_at || prospect.fit_score);
        if (status === "rejected") return prospect.status === "rejected";
        return true;
      })
      .filter((prospect) => {
        if (!q) return true;
        return [
          prospect.business_name,
          prospect.type,
          prospect.channel,
          prospect.address,
          prospect.fit_reason,
          prospect.suggested_pitch,
          prospect.trigger_reason,
        ].join(" ").toLowerCase().includes(q);
      })
      .filter((prospect) => sourceFilter === "all" || prospect.source === sourceFilter)
      .sort((a, b) => {
        if (a.duplicate_account_id && !b.duplicate_account_id) return 1;
        if (!a.duplicate_account_id && b.duplicate_account_id) return -1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [prospects, search, status]);

  const grouped = useMemo(() => {
    const now = Date.now();
    const week = 7 * 86400000;
    const month = 30 * 86400000;
    return [
      { label: "This Week", items: filtered.filter((p) => now - new Date(p.created_at).getTime() <= week) },
      { label: "This Month", items: filtered.filter((p) => { const age = now - new Date(p.created_at).getTime(); return age > week && age <= month; }) },
      { label: "Older", items: filtered.filter((p) => now - new Date(p.created_at).getTime() > month) },
    ].filter((g) => g.items.length > 0);
  }, [filtered]);

  async function runFinder() {
    setRunning(true);
    try {
      const response = await fetch("/api/prospects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-finder" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Finder run failed");
      showActionFeedback(`Finder added ${body.inserted ?? 0} new prospect${body.inserted === 1 ? "" : "s"}.`, "success");
      onRefresh();
    } catch (error) {
      showActionFeedback(error instanceof Error ? error.message : "Finder run failed.", "error");
    } finally {
      setRunning(false);
    }
  }

  async function enrichAll() {
    setEnriching(true);
    try {
      const response = await fetch("/api/prospects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enrich-all" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Enrichment failed");
      showActionFeedback(`Enriched ${body.updated ?? 0} prospect${body.updated === 1 ? "" : "s"}.`, "success");
      onRefresh();
    } catch (error) {
      showActionFeedback(error instanceof Error ? error.message : "Enrichment failed.", "error");
    } finally {
      setEnriching(false);
    }
  }

  async function addManualProspect() {
    const response = await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      showActionFeedback("Couldn’t add prospect.", "error");
      return;
    }
    setShowAdd(false);
    setForm({
      business_name: "",
      type: "",
      channel: "Restaurants",
      address: "",
      website: "",
      instagram: "",
      notes: "",
      source_url: "",
      research_query: "",
      source: "manual",
    });
    showActionFeedback("Prospect added.", "success");
    onRefresh();
  }

  async function updateProspect(prospect: Prospect, action: "enrich" | "reject" | "reopen" | "approve") {
    setActionId(prospect.id);
    try {
      if (action === "approve") {
        const tab = channelToTab(prospect.channel || prospect.type);
        const addResponse = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tab,
            account: prospect.business_name,
            type: prospect.type || prospect.channel || "",
            location: prospect.address || "",
            website: prospect.website || "",
            ig: prospect.instagram || "",
            status: "Identified",
            nextSteps: prospect.suggested_pitch || prospect.fit_reason || "",
            notes: [
              prospect.fit_reason ? `FIT: ${prospect.fit_reason}` : "",
              prospect.trigger_reason ? `TRIGGER: ${prospect.trigger_reason}` : "",
              prospect.source_url ? `SOURCE: ${prospect.source_url}` : "",
              prospect.notes || "",
            ].filter(Boolean).join("\n"),
          }),
        });
        const addBody = await addResponse.json().catch(() => ({}));
        if (!addResponse.ok && addResponse.status !== 409) throw new Error(addBody.error || "Couldn’t add to pipeline");
      }

      const response = await fetch("/api/prospects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: prospect.id, action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Prospect update failed");
      if (action === "approve") await fetchAllTabs();
      showActionFeedback(action === "approve" ? "Prospect added to Pipeline." : "Prospect updated.", "success");
      onRefresh();
    } catch (error) {
      showActionFeedback(error instanceof Error ? error.message : "Prospect update failed.", "error");
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Metric label="Open Prospects" value={String(openProspects.length)} accent="#64f5ea" />
        <Metric label="Trigger Signals" value={String(triggeredCount)} accent="#ffb321" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-rs-border/70 bg-white/5 p-3 sm:flex-row sm:items-center">
            <SearchBar value={search} onChange={setSearch} placeholder="Search prospects, channels, triggers..." />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-xl border border-rs-border bg-rs-bg px-3 py-2 text-sm text-rs-cream outline-none focus:border-rs-gold"
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="rounded-xl border border-rs-border bg-rs-bg px-3 py-2 text-sm text-rs-cream outline-none focus:border-rs-gold"
            >
              <option value="all">All sources</option>
              <option value="finder">Finder</option>
              <option value="daily-drip">Daily Drip</option>
              <option value="ig-scan">Instagram</option>
              <option value="permit-watch">Permits</option>
              <option value="job-scan">Job Boards</option>
              <option value="manual">Manual</option>
            </select>
            <Button onClick={() => setShowAdd(true)} variant="secondary">Add Prospect</Button>
            <Button onClick={runFinder} disabled={running}>{running ? "Running..." : "Run Finder"}</Button>
          </div>

          <div className="space-y-5">
            {grouped.map((group) => (
              <div key={group.label} className="space-y-3">
                <div className="text-[10px] uppercase tracking-[0.3em] text-[#af9fe6]">
                  {group.label} · {group.items.length}
                </div>
                {group.items.map((prospect) => (
                  <ProspectCard
                    key={prospect.id}
                    prospect={prospect}
                    busy={actionId === prospect.id}
                    onAction={(action) => updateProspect(prospect, action)}
                  />
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <Card>
                <div className="py-8 text-center text-sm text-[#af9fe6]">
                  No prospects match this view. Run Finder to generate a fresh batch.
                </div>
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Lead Enrichment</div>
              <div className="mt-1 text-sm text-[#d8ccfb]">
                Fills fit score, confidence, pitch angle, and next research cue for open prospects.
              </div>
            </div>
            <Button onClick={enrichAll} disabled={enriching} className="w-full">
              {enriching ? "Enriching..." : "Enrich Open Prospects"}
            </Button>
          </Card>

          <Card className="space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Recurring Finder Buckets</div>
              <div className="mt-1 text-sm text-[#d8ccfb]">
                These buckets feed manual runs now and the weekly cron once configured.
              </div>
            </div>
            <div className="space-y-2">
              {buckets.map((bucket) => (
                <a
                  key={bucket.id}
                  href={bucket.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-rs-border/60 bg-black/10 px-3 py-2 transition-colors hover:border-rs-gold/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-rs-cream">{bucket.label}</div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-rs-gold">{bucket.cadence}</div>
                  </div>
                  <div className="mt-1 text-xs text-[#af9fe6]">{bucket.description}</div>
                </a>
              ))}
            </div>
          </Card>

          <Card className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Trigger Signals</div>
            <div className="text-sm text-[#d8ccfb]">
              Triggers are timed reasons to reach out: food truck calendars, events, venue partnerships, retail sampling, or seasonal menu moments.
            </div>
          </Card>
        </div>
      </div>

      {showAdd && (
        <Modal title="Add Prospect" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <Input label="Business Name" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Channel" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} options={[
                { value: "Restaurants", label: "Restaurants" },
                { value: "Retail", label: "Retail" },
                { value: "Catering", label: "Catering" },
                { value: "Food Truck", label: "Food Truck" },
              ]} />
              <Input label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            </div>
            <Input label="Location" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <Input label="Website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            <Input label="Instagram" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
            <Input label="Source URL" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
            <Input label="Research Query" value={form.research_query} onChange={(e) => setForm({ ...form, research_query: e.target.value })} />
            <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={addManualProspect} disabled={!form.business_name}>Add</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Card>
      <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">{label}</div>
      <div className="mt-2 text-3xl font-black" style={{ color: accent }}>{value}</div>
    </Card>
  );
}

function ProspectCard({
  prospect,
  busy,
  onAction,
}: {
  prospect: Prospect;
  busy: boolean;
  onAction: (action: "enrich" | "reject" | "reopen" | "approve") => void;
}) {
  const approved = prospect.added_to_sheet || prospect.status === "approved";
  const rejected = prospect.status === "rejected";
  const duplicate = Boolean(prospect.duplicate_account_id);
  const ageColor = stalenessColor(prospect.created_at);
  const ageLabel = stalenessLabel(prospect.created_at);

  return (
    <Card className={`space-y-3 ${duplicate ? "border-rs-gold/45" : ""}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-rs-cream">{prospect.business_name}</h3>
            <Badge color={ageColor}>{ageLabel}</Badge>
            <Badge color={prospect.trigger_type ? "#ffb321" : "#8c7fbd"}>{statusLabel(prospect)}</Badge>
            {duplicate && <Badge color="#ffb321">Duplicate</Badge>}
          </div>
          <div className="mt-1 text-sm text-[#af9fe6]">
            {[prospect.channel || prospect.type, prospect.address, prospect.source].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!approved && !rejected && !duplicate && (
            <button
              type="button"
              onClick={() => onAction("approve")}
              disabled={busy}
              className="rounded-lg border border-rs-cyan/40 bg-rs-cyan/10 px-2.5 py-1 text-[11px] font-semibold text-rs-cyan transition-colors hover:bg-rs-cyan/20 disabled:opacity-50"
            >
              Approve
            </button>
          )}
          {!approved && !rejected && (
            <>
              <button
                type="button"
                onClick={() => onAction("enrich")}
                disabled={busy}
                className="rounded-lg border border-rs-border/60 bg-white/5 px-2 py-1 text-[11px] font-semibold text-[#af9fe6] transition-colors hover:border-rs-gold/50 hover:text-rs-gold disabled:opacity-50"
              >
                Enrich
              </button>
              <button
                type="button"
                onClick={() => onAction("reject")}
                disabled={busy}
                className="rounded-lg border border-rs-border/60 bg-white/5 px-2 py-1 text-[11px] font-semibold text-[#af9fe6] transition-colors hover:border-rs-punch/40 hover:text-rs-punch disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
          {rejected && (
            <button
              type="button"
              onClick={() => onAction("reopen")}
              disabled={busy}
              className="rounded-lg border border-rs-border/60 bg-white/5 px-2 py-1 text-[11px] font-semibold text-[#af9fe6] transition-colors hover:border-rs-gold/50 hover:text-rs-gold disabled:opacity-50"
            >
              Reopen
            </button>
          )}
        </div>
      </div>

      {duplicate && (
        <div className="rounded-xl border border-rs-gold/30 bg-rs-gold/10 px-3 py-2 text-sm text-[#ffe7a3]">
          This looks like an account already in Pipeline. Keeping it out of approval prevents duplicate account records.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <InfoBlock label="Why It Fits" value={prospect.fit_reason || prospect.notes || "Needs research."} />
        <InfoBlock label="Suggested Pitch" value={prospect.suggested_pitch || "Enrich this prospect for a suggested pitch."} />
      </div>

      {(prospect.trigger_type || prospect.trigger_reason) && (
        <div className="rounded-xl border border-rs-sunset/30 bg-rs-sunset/10 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-rs-sunset">Trigger Signal</div>
          <div className="mt-1 text-sm text-[#ffe8ca]">{prospect.trigger_reason || prospect.trigger_type}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-[#af9fe6]">
        {prospect.research_query ? <span>Query: {prospect.research_query}</span> : null}
        {prospect.source_url ? (
          <a href={prospect.source_url} target="_blank" rel="noreferrer" className="text-rs-cyan hover:text-rs-gold">
            Source
          </a>
        ) : null}
      </div>
    </Card>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
      style={{ borderColor: `${color}66`, backgroundColor: `${color}18`, color }}
    >
      {children}
    </span>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-rs-border/50 bg-black/10 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8c7fbd]">{label}</div>
      <div className="mt-1 line-clamp-3 text-sm leading-6 text-[#d8ccfb]">{value}</div>
    </div>
  );
}
