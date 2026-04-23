export function hasCSE(): boolean {
  return Boolean(process.env.GOOGLE_CSE_ID && process.env.GOOGLE_CSE_KEY);
}

export interface CSEResult {
  title: string;
  link: string;
  snippet: string;
}

export async function cseSearch(
  query: string,
  opts: { num?: number; dateRestrict?: string } = {}
): Promise<CSEResult[]> {
  if (!hasCSE()) return [];
  try {
    const params = new URLSearchParams({
      key: process.env.GOOGLE_CSE_KEY!,
      cx: process.env.GOOGLE_CSE_ID!,
      q: query,
      num: String(Math.min(opts.num ?? 10, 10)),
    });
    if (opts.dateRestrict) params.set("dateRestrict", opts.dateRestrict);
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    if (!res.ok) return [];
    const json = await res.json();
    return ((json.items ?? []) as Array<{ title: string; link: string; snippet: string }>).map((i) => ({
      title: i.title,
      link: i.link,
      snippet: i.snippet,
    }));
  } catch (error) {
    console.error("cseSearch error:", error);
    return [];
  }
}
