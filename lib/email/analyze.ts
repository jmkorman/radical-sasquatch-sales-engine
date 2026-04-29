import { generateJSON, hasAnthropic } from "@/lib/ai/anthropic";
import { STATUS_VALUES } from "@/lib/utils/constants";

export interface AnalyzeEmailInput {
  direction: "outbound" | "inbound";
  subject: string;
  snippet: string;
  /** Optional longer body — caller decides how much to send */
  body?: string;
  currentStatus?: string;
}

export interface EmailAnalysis {
  /** ISO date (YYYY-MM-DD) for the next time Jake should follow up. Only for outbound. */
  followUpDate: string | null;
  /** Short rationale for the follow-up date */
  followUpReason: string | null;
  /** Suggested next status if a transition is clearly warranted, else null */
  suggestedStatus: string | null;
  /** Short rationale for the status change */
  statusReason: string | null;
  /** Extracted concrete action items from inbound emails */
  actionItems: string[];
}

const EMPTY: EmailAnalysis = {
  followUpDate: null,
  followUpReason: null,
  suggestedStatus: null,
  statusReason: null,
  actionItems: [],
};

function todayISO(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function addBusinessDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Heuristic fallback when Anthropic isn't configured or fails.
 * Maps common status transitions and gives a sensible default follow-up date.
 */
function heuristicFallback(input: AnalyzeEmailInput): EmailAnalysis {
  const text = `${input.subject} ${input.snippet} ${input.body ?? ""}`.toLowerCase();
  const result: EmailAnalysis = { ...EMPTY };

  if (input.direction === "outbound") {
    // Default follow-up windows by status
    const status = input.currentStatus ?? "";
    const days =
      status === "Sample Sent" ? 5
        : status === "Tasting Complete" ? 7
          : status === "Decision Pending" ? 4
            : status === "Connected" ? 5
              : 3; // Identified / Reached Out / unknown
    result.followUpDate = addBusinessDays(todayISO(), days);
    result.followUpReason = `Default ${days} business days for "${status || "outreach"}"`;

    // Status transitions on outbound
    if (status === "Identified" && /intro|introducing|nice to (?:meet|connect)|reaching out/.test(text)) {
      result.suggestedStatus = "Reached Out";
      result.statusReason = "Detected intro/outreach language";
    } else if (/sent (?:a |the )?sample|samples? (?:are |is )?(?:on (?:its|their) way|in the mail|shipped)/.test(text)) {
      result.suggestedStatus = "Sample Sent";
      result.statusReason = "Detected sample-sending language";
    }
  } else {
    // Inbound: light keyword-based status hints + simple action item extraction
    if (/(?:loved|delicious|great|amazing|fantastic).+(?:samples?|product|sauce)/.test(text)) {
      result.suggestedStatus = "Tasting Complete";
      result.statusReason = "Positive tasting feedback detected";
    } else if (/not (?:a )?(?:fit|interested)|pass|don'?t think|not for us/.test(text)) {
      result.suggestedStatus = "Not a Fit";
      result.statusReason = "Detected pass/decline language";
    } else if (input.currentStatus === "Identified" || input.currentStatus === "Reached Out") {
      result.suggestedStatus = "Connected";
      result.statusReason = "Reply received from prospect";
    }

    // Naive action items: lines that look imperative or contain "?"
    const candidates = (input.body ?? input.snippet)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 6 && line.length < 200)
      .filter((line) => /\?$|\bsend\b|\bcan you\b|\bcould you\b|\bplease\b|\bschedule\b|\bcall\b/i.test(line))
      .slice(0, 4);
    result.actionItems = candidates;
  }

  return result;
}

const SYSTEM_PROMPT = `You are an email analysis assistant for a B2B food sales pipeline. Given a sent or received email, you produce a structured JSON analysis used to update a CRM.

Pipeline statuses (in order): Identified, Reached Out, Connected, Sample Sent, Tasting Complete, Decision Pending, Backburner, Not a Fit.

Rules:
- "followUpDate" only applies to OUTBOUND emails. It is the date the salesperson should next reach out if there is no reply. Format as YYYY-MM-DD. Default windows: Identified/Reached Out → 3 business days, Sample Sent → 5 days, Tasting Complete → 7 days, Decision Pending → 4 days. Adjust if the email itself mentions a date ("let's talk Friday", "I'll circle back next week").
- "suggestedStatus" only when the email clearly warrants a transition. Otherwise null. Be conservative; do not guess.
- "actionItems" only for INBOUND emails. Concrete things the salesperson must do (e.g., "Send pricing for kegs", "Schedule tasting Tuesday 2pm"). Empty array if none.
- "followUpReason" and "statusReason" are short human-readable rationales (under 80 chars each).

Return ONLY valid JSON, no prose.`;

export async function analyzeEmail(input: AnalyzeEmailInput): Promise<EmailAnalysis> {
  if (!hasAnthropic()) {
    return heuristicFallback(input);
  }

  const today = todayISO();
  const userPrompt = `Today: ${today}
Direction: ${input.direction}
Current account status: ${input.currentStatus || "unknown"}
Subject: ${input.subject}
Snippet: ${input.snippet}
${input.body ? `Body (truncated):\n${input.body.slice(0, 1500)}` : ""}

Return JSON with this exact shape:
{
  "followUpDate": "YYYY-MM-DD" | null,
  "followUpReason": string | null,
  "suggestedStatus": one of [${STATUS_VALUES.map((s) => `"${s}"`).join(", ")}] | null,
  "statusReason": string | null,
  "actionItems": string[]
}`;

  const result = await generateJSON<EmailAnalysis>({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 600,
  });

  if (!result) return heuristicFallback(input);

  // Sanitize: ensure suggestedStatus matches an allowed value
  const allowed = new Set<string>(STATUS_VALUES);
  const safeStatus =
    result.suggestedStatus && allowed.has(result.suggestedStatus) ? result.suggestedStatus : null;

  // Sanitize follow-up: must be ISO date and not in the past
  let safeFollowUp: string | null = null;
  if (result.followUpDate && /^\d{4}-\d{2}-\d{2}$/.test(result.followUpDate)) {
    if (result.followUpDate >= today) safeFollowUp = result.followUpDate;
  }

  return {
    followUpDate: input.direction === "outbound" ? safeFollowUp : null,
    followUpReason: result.followUpReason ?? null,
    suggestedStatus: safeStatus,
    statusReason: result.statusReason ?? null,
    actionItems: Array.isArray(result.actionItems)
      ? result.actionItems.filter((s) => typeof s === "string" && s.trim().length > 0).slice(0, 6)
      : [],
  };
}
