import { enrichProspect } from "@/lib/prospecting/finder";
import { cseSearch, hasCSE, CSEResult } from "@/lib/prospecting/shared/cse";
import { generateJSON, hasAnthropic } from "@/lib/prospecting/shared/anthropic";
import { loadExistingNormalizedNames } from "@/lib/prospecting/shared/dedupe";
import { insertProspects } from "@/lib/prospecting/shared/insert";
import { normalizeAccountName } from "@/lib/accounts/identity";

const QUERIES = [
  'site:culinaryagents.com Denver (chef OR "kitchen manager" OR "executive chef" OR "sous chef")',
  'site:poached.com Denver (chef OR "kitchen manager" OR "general manager")',
  'site:linkedin.com/jobs Denver (restaurant OR hospitality) ("kitchen manager" OR "executive chef" OR "food and beverage director")',
];

interface ExtractedVenue {
  index: number;
  business_name: string;
  type: string;
  role: string;
  trigger_reason: string;
}

export async function runJobScan(): Promise<{
  inserted: number;
  queried: number;
  extracted: number;
  skipped?: string;
}> {
  if (!hasCSE()) return { inserted: 0, queried: 0, extracted: 0, skipped: "no GOOGLE_CSE" };
  if (!hasAnthropic()) return { inserted: 0, queried: 0, extracted: 0, skipped: "no ANTHROPIC_API_KEY" };

  // Collect all results, deduplicate by link
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

  if (!allResults.length) return { inserted: 0, queried: 0, extracted: 0 };

  const resultsText = allResults
    .slice(0, 25)
    .map((r, i) => `${i + 1}. title: ${r.title}\n   url: ${r.link}\n   snippet: ${r.snippet}`)
    .join("\n\n");

  const system = `You extract hiring venue data from food-industry job board search results.
Output ONLY a valid JSON array. The "business_name" must be the HIRING VENUE (restaurant, bar, hotel, brewery) — NOT the job board.
Skip: staffing agencies, multi-location corporate offices, unnamed postings, generic aggregator pages.
Output nothing if you cannot identify a real venue.`;

  const user = `From these job posting search results, extract the HIRING VENUE for each Denver food/beverage role.

${resultsText}

Return a JSON array. For each result where you can identify a real Denver dining/hospitality venue, emit:
{
  "index": <result number>,
  "business_name": "<the venue, e.g. 'The Crawford Hotel' — NOT 'Culinary Agents'>",
  "type": "<Restaurant | Brewery | Bar | Hotel | Cafe | Other>",
  "role": "<the role being hired, e.g. 'Executive Chef'>",
  "trigger_reason": "<'Hiring {role} — indicates menu/program expansion or leadership change'>"
}
Skip staffing agencies, franchise support offices, and any posting where the venue is not named.`;

  const extracted = await generateJSON<ExtractedVenue[]>({ system, user, maxTokens: 2000 });
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
      source: "job-scan",
      source_url: sourceResult?.link ?? null,
      trigger_type: "leadership-hire",
      trigger_reason: item.trigger_reason,
      trigger_date: new Date().toISOString(),
      status: "triggered",
      finder_bucket: "menu-fit-bars-breweries",
      channel: "Restaurants",
      added_to_sheet: false,
    });
  });

  const inserted = await insertProspects(enriched);
  return { inserted: inserted.length, queried: allResults.length, extracted: extracted.length };
}
