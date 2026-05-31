/**
 * Lightweight email-signature field extraction.
 *
 * Pulls phone / title / website out of the bottom of an inbound email so we
 * can auto-enrich the matched contact and account without an AI call. Pure
 * regex — runs on every inbound email, so it must stay cheap.
 */

export interface SignatureFields {
  phone: string;
  title: string;
  website: string;
}

const EMPTY: SignatureFields = { phone: "", title: "", website: "" };

// Common job-title keywords. Matched against short lines near the signature.
const TITLE_KEYWORDS = [
  "owner", "founder", "co-founder", "ceo", "coo", "cfo", "president",
  "director", "manager", "general manager", "gm", "buyer", "purchasing",
  "chef", "executive chef", "head chef", "sous chef", "proprietor",
  "partner", "principal", "operations", "procurement", "vp", "vice president",
];

const GENERIC_TLD = /\.(com|net|org|io|co|us|biz|restaurant|cafe|kitchen)\b/i;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  // US numbers: 10 digits, or 11 starting with 1.
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return "";
}

function extractPhone(text: string): string {
  // Match formats like 303-555-1234, (303) 555-1234, +1 303.555.1234
  const match = text.match(
    /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g
  );
  if (!match) return "";
  for (const candidate of match) {
    const normalized = normalizePhone(candidate);
    if (normalized) return normalized;
  }
  return "";
}

function extractWebsite(text: string, excludeDomains: string[]): string {
  // Explicit URLs first.
  const urlMatch = text.match(/\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z0-9.-]+)\b/gi);
  if (!urlMatch) return "";
  const exclude = new Set(excludeDomains.map((d) => d.toLowerCase()));
  for (const raw of urlMatch) {
    const cleaned = raw
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    if (!GENERIC_TLD.test(cleaned)) continue;
    // Skip email-provider domains and the sender's own email domain.
    if (exclude.has(cleaned)) continue;
    if (/(gmail|yahoo|hotmail|outlook|icloud|aol|proton)\./.test(cleaned)) continue;
    return cleaned;
  }
  return "";
}

function extractTitle(lines: string[]): string {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 60) continue;
    const lower = trimmed.toLowerCase();
    // A title line is short and contains a known keyword as a near-whole line.
    const hit = TITLE_KEYWORDS.find((kw) => {
      const re = new RegExp(`(^|[\\s,|/])${kw}([\\s,|/]|$)`, "i");
      return re.test(lower);
    });
    if (hit) {
      // Return the original line, stripped of trailing separators.
      return trimmed.replace(/[\s|,/-]+$/, "");
    }
  }
  return "";
}

/**
 * Extract signature fields from an email body. `excludeDomains` should include
 * the sender's own email domain so we don't return it as a "website".
 */
export function extractSignatureFields(
  body: string | null | undefined,
  excludeDomains: string[] = []
): SignatureFields {
  if (!body || !body.trim()) return EMPTY;

  // Signatures live at the bottom — only scan the last ~15 non-empty lines.
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const tail = lines.slice(-15);
  const tailText = tail.join("\n");

  return {
    phone: extractPhone(tailText),
    title: extractTitle(tail),
    website: extractWebsite(tailText, excludeDomains),
  };
}
