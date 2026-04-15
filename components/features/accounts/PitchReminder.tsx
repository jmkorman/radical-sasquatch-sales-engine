"use client";

import { PITCH_RULES } from "@/lib/utils/constants";

export function PitchReminder({ accountName }: { accountName: string }) {
  const matchedRule = PITCH_RULES.find((rule) =>
    rule.match.some((m) => accountName.toLowerCase().includes(m.toLowerCase()))
  );

  if (!matchedRule) return null;

  return (
    <div className="bg-rs-gold/15 border border-rs-gold/30 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <svg className="w-5 h-5 text-rs-gold flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-sm text-rs-gold">{matchedRule.message}</div>
      </div>
    </div>
  );
}
