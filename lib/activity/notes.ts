import { extractGmailMarkers, stripGmailMarkers } from "@/lib/activity/gmailMarkers";
import { decodeHtmlEntities } from "@/lib/utils/htmlEntities";

// Structured note format:
// SUMMARY: one-line headline of what happened
// DETAILS: free-form body
// OBJECTION: what pushback / friction came up
// NEXT: next move

export interface ParsedNote {
  summary: string | null;
  details: string | null;
  objection: string | null;
  nextStep: string | null;
}

/** Display cap for Gmail auto-logged note bodies. Mirrors the 250-char insert
 *  cap in app/api/gmail/poll/route.ts; the small buffer here covers cases
 *  where a legacy log slipped through with a slightly longer snippet. */
export const GMAIL_DETAILS_DISPLAY_CAP = 280;

/** A note is treated as structured only if its first non-empty line begins
 *  with one of these section headers. This prevents a free-form note that
 *  happens to contain `NEXT:` mid-thought from being misinterpreted. */
const STRUCTURED_HEADER_START = /^(?:SUMMARY|DETAILS|OBJECTION|NEXT):/i;

export function parseActivityNote(note: string | null): ParsedNote {
  if (!note) return { summary: null, details: null, objection: null, nextStep: null };
  const { messageId, threadId } = extractGmailMarkers(note);

  // Only enter the structured branch if the very first non-empty line of the
  // note starts with a recognized section header. This guards against false
  // positives like a free-form note containing "NEXT: steps" mid-paragraph.
  const firstLine = note.replace(/^\s+/, "").split("\n", 1)[0] ?? "";
  if (STRUCTURED_HEADER_START.test(firstLine)) {
    // IMPORTANT: For DETAILS, OBJECTION, and NEXT we intentionally do NOT use
    // the `m` flag, because in multiline mode `$` matches end-of-LINE, which
    // would truncate multi-line content at the first newline. We use
    // `(?:^|\n)` as the start anchor so the section header still must begin
    // a line. All three lookaheads also stop at `\n[gmail-...]` markers so
    // the trailing thread ID on edited Gmail logs doesn't bleed into the
    // captured content.
    const GMAIL_BOUNDARY = "\\n\\[gmail-(?:message|thread):";
    const summaryMatch = note.match(/^SUMMARY:[ \t]*(.+?)\s*$/im);
    const detailsMatch = note.match(
      new RegExp(
        `(?:^|\\n)DETAILS:[ \\t]*([\\s\\S]*?)(?=${GMAIL_BOUNDARY}|\\nOBJECTION:|\\nNEXT:|$)`,
        "i"
      )
    );
    const objectionMatch = note.match(
      new RegExp(`(?:^|\\n)OBJECTION:[ \\t]*([\\s\\S]*?)(?=${GMAIL_BOUNDARY}|\\nNEXT:|$)`, "i")
    );
    const nextMatch = note.match(
      new RegExp(`(?:^|\\n)NEXT:[ \\t]*([\\s\\S]*?)(?=${GMAIL_BOUNDARY}|$)`, "i")
    );

    if (summaryMatch || detailsMatch || objectionMatch || nextMatch) {
      return {
        summary: summaryMatch ? summaryMatch[1].trim() : null,
        details: detailsMatch ? detailsMatch[1].trim() : null,
        objection: objectionMatch ? objectionMatch[1].trim() : null,
        nextStep: nextMatch ? nextMatch[1].trim() : null,
      };
    }
  }

  // Gmail auto-logged email (unedited) — detected by a Gmail marker
  if (messageId || threadId) {
    const sentMatch = note.match(/\[Sent\]\s*(.+?)$/m);
    const receivedMatch = note.match(/\[Received\]\s*(.+?)$/m);
    const isReceived = !sentMatch && !!receivedMatch;
    const subject = (sentMatch ?? receivedMatch)?.[1]?.trim() || "Email";

    // Strip markers + the [Sent]/[Received] header line + any From: line so
    // details show only the clean email body. Decode HTML entities (e.g.
    // `you&#39;re` → `you're`) that arrive embedded in Gmail snippets.
    let body = decodeHtmlEntities(
      stripGmailMarkers(note)
        .replace(/\[Sent\]\s*.+\n?\n?/, "")
        .replace(/\[Received\]\s*.+\n?\n?/, "")
        .replace(/^From:.+\n?/m, "")
        .trim()
    );

    // Cap to a brief summary — protects against legacy logs that captured
    // the full thread before the snippet-only refactor.
    if (body.length > GMAIL_DETAILS_DISPLAY_CAP) {
      body = `${body.slice(0, GMAIL_DETAILS_DISPLAY_CAP - 3).trimEnd()}...`;
    }

    return {
      summary: isReceived ? `Reply received: "${subject}"` : `Sent email: "${subject}"`,
      details: body || null,
      objection: null,
      nextStep: null,
    };
  }

  // Plain (free-form) note: split at the first blank line so the first
  // paragraph is the summary and the rest is the details. Notes with no
  // blank line stay as a single-summary note.
  const blankLineMatch = note.match(/\n[ \t]*\n/);
  if (blankLineMatch && typeof blankLineMatch.index === "number") {
    const splitAt = blankLineMatch.index;
    const summary = note.slice(0, splitAt).trim();
    const details = note.slice(splitAt + blankLineMatch[0].length).trim();
    return {
      summary: summary || null,
      details: details || null,
      objection: null,
      nextStep: null,
    };
  }

  return { summary: note.trim() || null, details: null, objection: null, nextStep: null };
}

export function formatActivityNote({
  summary,
  details,
  objection,
  nextStep,
}: {
  summary: string;
  details: string;
  objection?: string;
  nextStep: string;
}): string {
  const parts: string[] = [];
  if (summary.trim()) parts.push(`SUMMARY: ${summary.trim()}`);
  if (details.trim()) parts.push(`DETAILS: ${details.trim()}`);
  if (objection?.trim()) parts.push(`OBJECTION: ${objection.trim()}`);
  if (nextStep.trim()) parts.push(`NEXT: ${nextStep.trim()}`);
  return parts.join("\n");
}
