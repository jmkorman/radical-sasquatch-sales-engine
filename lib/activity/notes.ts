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

export function parseActivityNote(note: string | null): ParsedNote {
  if (!note) return { summary: null, details: null, objection: null, nextStep: null };

  const summaryMatch = note.match(/^SUMMARY:\s*(.+?)(?:\n|$)/im);
  const detailsMatch = note.match(/^DETAILS:\s*([\s\S]+?)(?:\nOBJECTION:|\nNEXT:|$)/im);
  const objectionMatch = note.match(/^OBJECTION:\s*(.+?)(?:\nNEXT:|$)/im);
  const nextMatch = note.match(/^NEXT:\s*(.+?)$/im);

  if (summaryMatch || detailsMatch || objectionMatch || nextMatch) {
    return {
      summary: summaryMatch ? summaryMatch[1].trim() : null,
      details: detailsMatch ? detailsMatch[1].trim() : null,
      objection: objectionMatch ? objectionMatch[1].trim() : null,
      nextStep: nextMatch ? nextMatch[1].trim() : null,
    };
  }

  // Plain note - treat entire text as summary
  return { summary: note, details: null, objection: null, nextStep: null };
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
