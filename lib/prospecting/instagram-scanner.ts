import { enrichProspect } from "@/lib/prospecting/finder";
import { cseSearch, hasCSE, CSEResult } from "@/lib/prospecting/shared/cse";
import { generateJSON, hasAnthropic } from "@/lib/prospecting/shared/anthropic";
import { loadExistingNormalizedNames } from "@/lib/prospecting/shared/dedupe";
import { insertProspects } from "@/lib/prospecting/shared/insert";
import { normalizeAccountName } from "@/lib/accounts/identity";

const QUERIES = [
  'site:instagram.com Denver "now hiring" (kitchen OR chef OR "line cook")',
  'site:instagram.com Denver "opening soon" (restaurant OR cafe OR brewery OR bakery)',
  'site:instagram.com Denver "grand opening" food',
  'site:instagram.com Denver "new menu" (restaurant OR taproom)',
  'site:instagram.com Denver "coming soon" restaurant',
];

interface ExtractedBusiness {
  index: number;
  business_name: string;
  type: string;
  trigger_type: string;
  trigger_reason: string;
}

export async function runInstagramScan(): Promise<{
  inserted: number;
  queried: number;
  extracted: number;
  skipped?: string;
}> {
  if (!hasCSE()) return { inserted: 0, queried: 0, extracted: 0, skipped: "no GOOGLE_CSE" };
  if (!hasAnthropic()) return { inserted: 0, queried: 0, extracted: 0, skipped: "no ANTHROPIC_API_KEY" };

  // Run all queries, deduplicate by link
  const allResults: CSEResult[] = [];
  const seenLinks = new Set<string>();
  for (const q of QUERIES) {
    const results = await cseSearch(q, { num: 10, dateRestrict: "m1" });
    for (const r of results) {
      if (!seenLinks.has(r.link)) {
        seenLinks.add(r.link);
        allResults.push(r);
      }
    }
  }

  if (!allResults.length) return { inserted: 0, queried: allResults.length, extracted: 0 };

  // Single batch Claude call to extract business names
  const resultsText = allResults
    .slice(0, 25)
    .map((r, i) => `${i + 1}. title: ${r.title}\n   url: ${r.link}\n   snippet: ${r.snippet}`)
    .join("\n\n");

  const system = `You extract structured business data from Instagram search result snippets.
Output ONLY a valid JSON array. If a snippet does not clearly reference a real, named Denver-area food or beverage business, omit it.
Do NOT invent businesses. Do NOT include generic aggregator accounts like "denver.eats" or "denverfoodscene".
National chains and franchises should be skipped.`;

  const user = `From these Instagram search results, extract the underlying BUSINESS NAME (not the IG handle) and classify the signal.

${resultsText}

Return a JSON array. For each result where you can confidently identify a real Denver food/beverage business, emit an object with:
{
  "index": <result number from above>,
  "business_name": "<exact business name, e.g. 'Cerebral Brewing' not '@cerebralbrewing'>",
  "type": "<Restaurant | Brewery | Cafe | Food Truck | Bar | Bakery | Other>",
  "trigger_type": "<hiring | opening-soon | grand-opening | new-menu | coming-soon>",
  "trigger_reason": "<one sentence quoting the specific signal from the snippet>"
}
Skip anything ambiguous. Skip national chains.`;

  const extracted = await generateJSON<ExtractedBusiness[]>({ system, user, maxTokens: 2000 });
  if (!extracted?.length) return { inserted: 0, queried: allResults.length, extracted: 0 };

  const existingNames = await loadExistingNormalizedNames();

  const novel = extracted.filter(
    (item) =>
      item.business_name?.trim() &&
      item.index >= 1 &&
      item.index <= allResults.length &&
      !existingNames.has(normalizeAccountName(item.business_name))
  );

  const enriched = novel.map((item) => {
    const sourceResult = allResults[item.index - 1];
    return enrichProspect({
      business_name: item.business_name.trim(),
      type: item.type || null,
      source: "ig-scan",
      source_url: sourceResult?.link ?? null,
      trigger_type: item.trigger_type,
      trigger_reason: item.trigger_reason,
      trigger_date: new Date().toISOString(),
      status: "triggered",
      finder_bucket: item.trigger_type === "hiring" ? "menu-fit-bars-breweries" : "new-restaurant-openings",
      channel: item.type?.toLowerCase().includes("retail") ? "Retail" : "Restaurants",
      added_to_sheet: false,
    });
  });

  const inserted = await insertProspects(enriched);
  return { inserted: inserted.length, queried: allResults.length, extracted: extracted.length };
}
