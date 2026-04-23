import { enrichProspect } from "@/lib/prospecting/finder";
import { loadExistingNormalizedNames } from "@/lib/prospecting/shared/dedupe";
import { insertProspects } from "@/lib/prospecting/shared/insert";
import { normalizeAccountName } from "@/lib/accounts/identity";

const DEFAULT_ENDPOINT =
  "https://data.colorado.gov/resource/7s5z-vewr.json?$where=upper(business_city)=%27DENVER%27%20AND%20upper(license_type)%20like%20%27%25FOOD%25%27&$order=first_issue_date%20DESC&$limit=200";

interface LicenseRecord {
  trade_name?: string;
  business_name?: string;
  street_address?: string;
  business_city?: string;
  license_type?: string;
  first_issue_date?: string;
  expiration_date?: string;
}

function mapLicenseType(licenseType: string): string {
  const t = licenseType.toLowerCase();
  if (t.includes("mobile") || t.includes("truck")) return "Food Truck";
  if (t.includes("retail") || t.includes("store") || t.includes("market")) return "Specialty Grocery";
  if (t.includes("cater")) return "Catering";
  if (t.includes("brew") || t.includes("tavern") || t.includes("bar")) return "Bar / Brewery";
  return "Restaurant";
}

function isWithinDays(dateStr: string | undefined, days: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.getTime() >= Date.now() - days * 86_400_000;
}

export async function runPermitWatch(): Promise<{
  inserted: number;
  checked: number;
  dropped_duplicates: number;
  skipped?: string;
}> {
  const endpoint = process.env.DENVER_LICENSE_ENDPOINT ?? DEFAULT_ENDPOINT;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.SODA_APP_TOKEN) headers["X-App-Token"] = process.env.SODA_APP_TOKEN;

  let records: LicenseRecord[] = [];
  try {
    const res = await fetch(endpoint, { headers });
    if (!res.ok) {
      console.error(`Permit watch fetch failed: ${res.status} ${res.statusText}`);
      return { inserted: 0, checked: 0, dropped_duplicates: 0, skipped: `fetch ${res.status}` };
    }
    records = await res.json() as LicenseRecord[];
  } catch (error) {
    console.error("Permit watch fetch error:", error);
    return { inserted: 0, checked: 0, dropped_duplicates: 0, skipped: "fetch error" };
  }

  // Keep only records issued in the last 14 days (weekly cron with overlap buffer)
  const recent = records.filter((r) => isWithinDays(r.first_issue_date, 14));
  if (!recent.length) return { inserted: 0, checked: records.length, dropped_duplicates: 0 };

  const existingNames = await loadExistingNormalizedNames();

  let droppedDuplicates = 0;
  const novel: LicenseRecord[] = [];
  for (const r of recent) {
    const name = (r.trade_name || r.business_name || "").trim();
    if (!name) continue;
    if (existingNames.has(normalizeAccountName(name))) {
      droppedDuplicates++;
    } else {
      novel.push(r);
    }
  }

  if (!novel.length) return { inserted: 0, checked: records.length, dropped_duplicates: droppedDuplicates };

  const licenseType = novel[0]?.license_type ?? "";
  const isMobile = licenseType.toLowerCase().includes("mobile") || licenseType.toLowerCase().includes("truck");

  const enriched = novel.map((r) => {
    const name = (r.trade_name || r.business_name || "").trim();
    const lt = r.license_type ?? "";
    const type = mapLicenseType(lt);
    const mobile = lt.toLowerCase().includes("mobile") || lt.toLowerCase().includes("truck");
    const address = r.street_address ? `${r.street_address}, Denver, CO` : "Denver, CO";
    return enrichProspect({
      business_name: name,
      type,
      address,
      source: "permit-watch",
      finder_bucket: mobile ? "food-truck-new-permits" : "new-restaurant-openings",
      trigger_type: "new-permit",
      trigger_reason: `New ${lt} issued ${r.first_issue_date?.split("T")[0] ?? "recently"}`,
      trigger_date: r.first_issue_date ?? new Date().toISOString(),
      status: "triggered",
      channel: mobile ? "Food Truck" : "Restaurants",
      added_to_sheet: false,
    });
  });

  void isMobile; // used per-item above; suppress lint

  const inserted = await insertProspects(enriched);
  return { inserted: inserted.length, checked: records.length, dropped_duplicates: droppedDuplicates };
}
