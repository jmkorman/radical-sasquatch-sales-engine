import { FINDER_BUCKETS, enrichProspect } from "@/lib/prospecting/finder";
import { generateJSON, hasAnthropic } from "@/lib/prospecting/shared/anthropic";
import { loadExistingNormalizedNames } from "@/lib/prospecting/shared/dedupe";
import { insertProspects } from "@/lib/prospecting/shared/insert";
import { normalizeAccountName } from "@/lib/accounts/identity";

interface DripItem {
  business_name: string;
  type: string;
  address: string;
  website: string;
  instagram: string;
  fit_reason: string;
  suggested_pitch: string;
  trigger_reason: string;
}

// Rotate through all 11 buckets deterministically — hits each bucket every ~11 days
function todaysBucket() {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return FINDER_BUCKETS[dayIndex % FINDER_BUCKETS.length];
}

export async function runDailyDrip(): Promise<{ inserted: number; bucket_id: string; skipped?: string }> {
  if (!hasAnthropic()) return { inserted: 0, bucket_id: "", skipped: "no ANTHROPIC_API_KEY" };

  const bucket = todaysBucket();
  const existingNames = await loadExistingNormalizedNames();

  // Pass first 80 names to the prompt as a soft avoid-list
  const avoidList = Array.from(existingNames).slice(0, 80).join(", ");

  const system = `You are a B2B sales research assistant for Radical Sasquatch Dumplings, a Denver-based frozen dumpling brand.
You generate real, high-quality Denver-area prospect leads for a given sales bucket.
Output ONLY a valid JSON array — no prose, no markdown fences, no explanation.
Every business must be real, currently operating in the Denver metro (within 30 miles of downtown), and must NOT be a national chain.`;

  const user = `Generate 8 fresh Denver-area prospect ideas for this sales bucket:
Bucket: "${bucket.label}"
Description: ${bucket.description}

Avoid any business whose name is similar to these (case-insensitive): ${avoidList}

Return a JSON array of 8 objects with these exact keys:
- business_name (string — exact business name, not a category)
- type (string — e.g. "Brewery", "Boutique Hotel", "Food Truck")
- address (string — Denver neighborhood or street; use "Denver, CO" if unknown)
- website (string — root domain if known, otherwise empty string)
- instagram (string — @handle if known, otherwise empty string)
- fit_reason (string — one sentence why they fit "${bucket.label}")
- suggested_pitch (string — one tactical sentence opener for first contact)
- trigger_reason (string — specific reason to reach out NOW, or empty string)

No duplicates with the avoid list. No national chains.`;

  const items = await generateJSON<DripItem[]>({ system, user, maxTokens: 2500 });
  if (!items?.length) return { inserted: 0, bucket_id: bucket.id };

  const novel = items.filter(
    (item) => item.business_name?.trim() && !existingNames.has(normalizeAccountName(item.business_name))
  );

  const enriched = novel.map((item) =>
    enrichProspect({
      business_name: item.business_name.trim(),
      type: item.type || null,
      address: item.address || null,
      website: item.website || null,
      instagram: item.instagram || null,
      fit_reason: item.fit_reason || null,
      suggested_pitch: item.suggested_pitch || null,
      trigger_reason: item.trigger_reason || null,
      trigger_type: item.trigger_reason ? "daily-drip" : null,
      trigger_date: item.trigger_reason ? new Date().toISOString() : null,
      source: "daily-drip",
      finder_bucket: bucket.id,
      channel: bucket.channel,
      status: item.trigger_reason ? "triggered" : "new",
      added_to_sheet: false,
    })
  );

  const inserted = await insertProspects(enriched);
  return { inserted: inserted.length, bucket_id: bucket.id };
}
