"use client";

import { AnyAccount } from "@/types/accounts";
import { Card } from "@/components/ui/Card";
import { getPlaybookForAccount } from "@/lib/sales/playbooks";

export function PlaybookPanel({ account }: { account: AnyAccount }) {
  const playbook = getPlaybookForAccount(account);

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Active Playbook</div>
          <div className="mt-1 text-lg font-semibold text-rs-cream">{playbook.title}</div>
          <p className="mt-1 text-sm text-[#d8ccfb]">{playbook.strategy}</p>
        </div>

        <div className="rounded-2xl border border-rs-border/60 bg-black/10 p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rs-gold">Best Fit</div>
          <p className="mt-2 text-sm text-[#ece5ff]">{playbook.bestFit}</p>
        </div>

        <Section title="Talk Track" items={playbook.talkTrack} />
        <Section title="Qualification" items={playbook.qualification} />
        <Section title="Next Actions" items={playbook.nextActions} />
        <Section title="Warning Flags" items={playbook.warningFlags} tone="warning" />
      </div>
    </Card>
  );
}

function Section({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: string[];
  tone?: "default" | "warning";
}) {
  return (
    <div>
      <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${tone === "warning" ? "text-[#ffd6e8]" : "text-rs-gold"}`}>
        {title}
      </div>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div
            key={item}
            className={`rounded-xl border px-3 py-2 text-sm ${
              tone === "warning"
                ? "border-rs-punch/40 bg-rs-punch/10 text-[#ffe2ef]"
                : "border-rs-border/50 bg-black/10 text-[#ece5ff]"
            }`}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
