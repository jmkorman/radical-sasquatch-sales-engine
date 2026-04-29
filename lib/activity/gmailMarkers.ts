const GMAIL_MESSAGE_MARKER = /\[gmail-message:([^\]]+)\]/i;
const GMAIL_THREAD_MARKER = /\[gmail-thread:([^\]]+)\]/i;
const GMAIL_MARKERS_GLOBAL = /\n?\[gmail-(?:message|thread):[^\]]+\]/gi;

export function extractGmailMessageId(note: string | null | undefined): string | null {
  if (!note) return null;
  return note.match(GMAIL_MESSAGE_MARKER)?.[1] ?? null;
}

export function extractGmailThreadId(note: string | null | undefined): string | null {
  if (!note) return null;
  return note.match(GMAIL_THREAD_MARKER)?.[1] ?? null;
}

export function extractGmailMarkers(note: string | null | undefined): {
  messageId: string | null;
  threadId: string | null;
} {
  return {
    messageId: extractGmailMessageId(note),
    threadId: extractGmailThreadId(note),
  };
}

export function stripGmailMarkers(note: string): string {
  return note.replace(GMAIL_MARKERS_GLOBAL, "").trim();
}

export function appendGmailMarkers(
  note: string,
  markers: { messageId?: string | null; threadId?: string | null }
): string {
  const base = stripGmailMarkers(note);
  const markerLines = [
    markers.messageId ? `[gmail-message:${markers.messageId}]` : null,
    markers.threadId ? `[gmail-thread:${markers.threadId}]` : null,
  ].filter(Boolean) as string[];

  return [...(base ? [base] : []), ...markerLines].join("\n").trim();
}
