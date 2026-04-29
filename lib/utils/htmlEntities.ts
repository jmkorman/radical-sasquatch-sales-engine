// Gmail snippets and some HTML-fallback bodies arrive with HTML entities like
// `&#39;` (apostrophe), `&amp;`, `&nbsp;`, etc. We decode them so notes and
// activity-log details render with real punctuation, not encoded gibberish.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
  reg: "®",
  trade: "™",
};

/**
 * Decode the most common HTML entities found in Gmail-extracted text.
 * Handles named (&amp;), numeric decimal (&#39;), and numeric hex (&#x27;).
 * Safe to call on already-clean text — no-ops if no entities are present.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input) return input;
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith("#")) {
      const code = parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}
