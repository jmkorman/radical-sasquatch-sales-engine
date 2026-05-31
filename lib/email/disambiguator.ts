/**
 * AI tiebreaker for ambiguous email→account matches.
 *
 * Called only when scoreMessage returns "ambiguous" or a low-confidence
 * "below_threshold" with at least 2 candidates. Uses Haiku for speed and
 * cost — this is a yes/no/which-one classifier, not a generation task.
 */

import { generateJSON, hasAnthropic } from "@/lib/ai/anthropic";
import { AnyAccount } from "@/types/accounts";
import { GmailSentMessage } from "@/lib/gmail/sent";

export interface DisambiguateInput {
  message: GmailSentMessage;
  candidates: Array<{ account: AnyAccount; score: number; reasons: string[] }>;
}

export interface DisambiguateResult {
  /** Chosen account id, or null if none of the candidates fit. */
  accountId: string | null;
  /** Brief rationale from the model. */
  reason: string;
}

const SYSTEM = `You are a CRM email-routing assistant. Given one email and 2–3 candidate B2B accounts, decide which (if any) the email is actually about.

Return JSON only:
{ "accountId": string | null, "reason": string (≤120 chars) }

Pick null aggressively when the email doesn't clearly belong to any candidate (e.g., automated notification, distributor blast, unrelated subject). Being wrong is worse than skipping.`;

export async function disambiguate(input: DisambiguateInput): Promise<DisambiguateResult> {
  if (!hasAnthropic() || input.candidates.length === 0) {
    return { accountId: null, reason: "ai-disabled-or-no-candidates" };
  }

  const candidateList = input.candidates
    .map(
      (c, i) =>
        `${i + 1}. id="${c.account.id}" name="${c.account.account}" tab="${c.account._tab}" ` +
        `email="${c.account.email ?? ""}" website="${
          (c.account as unknown as { website?: string }).website ?? ""
        }" contact="${c.account.contactName ?? ""}" score=${c.score} reasons=${JSON.stringify(c.reasons)}`
    )
    .join("\n");

  const snippet = (input.message.snippet ?? input.message.body ?? "").slice(0, 600);

  const user = `Email:
  From: ${input.message.from}
  To: ${input.message.to}
  Subject: ${input.message.subject}
  Snippet: ${snippet}

Candidates:
${candidateList}

Which candidate does this email belong to? Return null if none clearly fit.`;

  const result = await generateJSON<{ accountId: string | null; reason: string }>({
    system: SYSTEM,
    user,
    maxTokens: 200,
    model: "claude-haiku-4-5-20251001",
  });

  if (!result) return { accountId: null, reason: "ai-no-response" };

  // Verify the chosen id is actually one of the candidates we offered.
  const allowed = new Set(input.candidates.map((c) => c.account.id));
  const safeId = result.accountId && allowed.has(result.accountId) ? result.accountId : null;
  return { accountId: safeId, reason: result.reason ?? "" };
}
