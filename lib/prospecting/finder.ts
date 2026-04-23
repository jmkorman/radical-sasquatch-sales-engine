import { Prospect, ProspectFinderBucket } from "@/types/prospects";
import { AnyAccount } from "@/types/accounts";
import { normalizeAccountName } from "@/lib/accounts/identity";

export type ProspectSeed = Omit<Partial<Prospect>, "id" | "created_at"> & {
  business_name: string;
  type: string;
  channel: string;
  finder_bucket: string;
  research_query: string;
  source_url: string;
  fit_reason: string;
  suggested_pitch: string;
  trigger_type?: string;
  trigger_reason?: string;
};

export const FINDER_BUCKETS: ProspectFinderBucket[] = [
  {
    id: "brewery-food-truck-rotations",
    label: "Brewery Food Truck Rotations",
    channel: "Food Truck",
    cadence: "Weekly",
    description: "Breweries that publish rotating food truck schedules or need consistent event food.",
    searchQuery: "Denver brewery food truck schedule dumplings taproom food partner",
    sourceUrl: "https://www.google.com/search?q=Denver+brewery+food+truck+schedule",
  },
  {
    id: "specialty-grocery-retail",
    label: "Specialty Grocery Retail",
    channel: "Retail",
    cadence: "Weekly",
    description: "Independent grocers, gourmet markets, and local-food retailers that can carry frozen dumplings.",
    searchQuery: "Denver specialty grocery local frozen foods buyer",
    sourceUrl: "https://www.google.com/search?q=Denver+specialty+grocery+local+frozen+foods",
  },
  {
    id: "corporate-catering",
    label: "Corporate Catering",
    channel: "Catering",
    cadence: "Weekly",
    description: "Office-heavy companies and coworking spaces likely to order lunches, tastings, or internal events.",
    searchQuery: "Denver corporate offices employee lunch catering events",
    sourceUrl: "https://www.google.com/search?q=Denver+corporate+offices+catering+events",
  },
  {
    id: "event-wedding-venues",
    label: "Event + Wedding Venues",
    channel: "Catering",
    cadence: "Biweekly",
    description: "Venues and planners where dumplings can become a late-night snack, cocktail-hour bite, or preferred vendor option.",
    searchQuery: "Denver wedding venue preferred caterers late night snack",
    sourceUrl: "https://www.google.com/search?q=Denver+wedding+venue+preferred+caterers",
  },
  {
    id: "menu-fit-bars-breweries",
    label: "Menu-Fit Bars + Breweries",
    channel: "Restaurants",
    cadence: "Weekly",
    description: "Bars and breweries where a shareable, high-margin dumpling appetizer fits the menu.",
    searchQuery: "Denver bars breweries shareable appetizers kitchen manager",
    sourceUrl: "https://www.google.com/search?q=Denver+bars+breweries+shareable+appetizers",
  },
  {
    id: "trigger-event-calendars",
    label: "Event Calendar Triggers",
    channel: "Catering",
    cadence: "Weekly",
    description: "Businesses and venues with upcoming events that create a timely reason to reach out.",
    searchQuery: "Denver upcoming corporate events venue calendar catering",
    sourceUrl: "https://www.google.com/search?q=Denver+upcoming+corporate+events+venue+calendar+catering",
  },
  {
    id: "new-restaurant-openings",
    label: "New Restaurant Openings",
    channel: "Restaurants",
    cadence: "Monthly",
    description: "Restaurants opened in the last 90 days — still setting up supplier relationships and open to new products.",
    searchQuery: "Denver new restaurant opening 2026 grand opening menu",
    sourceUrl: "https://www.google.com/search?q=Denver+new+restaurant+opening+2026",
  },
  {
    id: "taprooms-adding-kitchen",
    label: "Taprooms Adding a Kitchen",
    channel: "Restaurants",
    cadence: "Monthly",
    description: "Breweries and taprooms that recently added a food program — actively building their menu and supplier list.",
    searchQuery: "Denver brewery taproom new kitchen food menu 2026",
    sourceUrl: "https://www.google.com/search?q=Denver+brewery+taproom+new+kitchen+food+menu+2026",
  },
  {
    id: "food-festival-market-vendors",
    label: "Food Festival & Market Vendors",
    channel: "Catering",
    cadence: "Biweekly",
    description: "Vendors at local food festivals, pop-ups, and farmers markets — active food businesses worth prospecting.",
    searchQuery: "Denver food festival farmers market vendor list 2026",
    sourceUrl: "https://www.google.com/search?q=Denver+food+festival+farmers+market+vendor+2026",
  },
  {
    id: "boutique-hotel-venue-fb",
    label: "Boutique Hotels & Venue F&B",
    channel: "Catering",
    cadence: "Monthly",
    description: "Boutique hotels and event venues with in-house F&B — recurring catering volume, high LTV.",
    searchQuery: "Denver boutique hotel restaurant event venue in-house catering",
    sourceUrl: "https://www.google.com/search?q=Denver+boutique+hotel+restaurant+event+venue+catering",
  },
  {
    id: "food-truck-new-permits",
    label: "Food Truck New Permits",
    channel: "Food Truck",
    cadence: "Monthly",
    description: "Newly permitted food trucks actively launching and selecting their initial supplier relationships.",
    searchQuery: "Denver new food truck permit 2026 launching opening",
    sourceUrl: "https://www.google.com/search?q=Denver+new+food+truck+permit+2026+launching",
  },
];

const SEEDS: ProspectSeed[] = [
  {
    business_name: "Comrade Brewing",
    type: "Brewery",
    channel: "Food Truck",
    finder_bucket: "brewery-food-truck-rotations",
    address: "Denver",
    research_query: "Comrade Brewing food truck schedule",
    source_url: "https://www.google.com/search?q=Comrade+Brewing+food+truck+schedule",
    fit_reason: "Taproom audience, rotating food opportunity, and strong fit for fast hot service.",
    suggested_pitch: "Pitch a dumpling pop-up night or recurring food truck slot built around beer-pairing flavors.",
    trigger_type: "food-truck-calendar",
    trigger_reason: "Food truck rotation model creates recurring openings.",
  },
  {
    business_name: "Hogshead Brewery",
    type: "Brewery",
    channel: "Food Truck",
    finder_bucket: "brewery-food-truck-rotations",
    address: "Denver",
    research_query: "Hogshead Brewery food truck schedule",
    source_url: "https://www.google.com/search?q=Hogshead+Brewery+food+truck+schedule",
    fit_reason: "Neighborhood brewery with audience that can support a recurring pop-up.",
    suggested_pitch: "Lead with a low-lift weeknight food truck slot and a small sampling tray for staff.",
    trigger_type: "food-truck-calendar",
    trigger_reason: "Food partner calendar is a natural reason to reach out.",
  },
  {
    business_name: "The Local Butcher",
    type: "Specialty Grocery",
    channel: "Retail",
    finder_bucket: "specialty-grocery-retail",
    address: "Denver",
    research_query: "Denver local butcher specialty grocery frozen local foods",
    source_url: "https://www.google.com/search?q=Denver+local+butcher+specialty+grocery+frozen+local+foods",
    fit_reason: "Local-food retail customer likely understands premium frozen products.",
    suggested_pitch: "Pitch a small frozen case trial with local brand story, margin, and tasting support.",
  },
  {
    business_name: "Leevers Locavore",
    type: "Specialty Grocery",
    channel: "Retail",
    finder_bucket: "specialty-grocery-retail",
    address: "Denver",
    research_query: "Leevers Locavore local frozen food buyer",
    source_url: "https://www.google.com/search?q=Leevers+Locavore+local+frozen+food+buyer",
    fit_reason: "Local-focused grocery with shoppers who actively buy Colorado brands.",
    suggested_pitch: "Lead with Colorado-made frozen dumplings and offer a weekend sampling activation.",
  },
  {
    business_name: "Improper City",
    type: "Event Venue / Beer Garden",
    channel: "Catering",
    finder_bucket: "trigger-event-calendars",
    address: "RiNo",
    research_query: "Improper City event calendar food vendor Denver",
    source_url: "https://www.google.com/search?q=Improper+City+event+calendar+food+vendor+Denver",
    fit_reason: "Large casual events create an easy test environment for dumplings.",
    suggested_pitch: "Pitch a pop-up/event food partnership tied to a specific event date.",
    trigger_type: "event-calendar",
    trigger_reason: "Public event programming creates timed outreach hooks.",
  },
  {
    business_name: "Mile High Station",
    type: "Event Venue",
    channel: "Catering",
    finder_bucket: "event-wedding-venues",
    address: "Denver",
    research_query: "Mile High Station preferred caterers late night snack",
    source_url: "https://www.google.com/search?q=Mile+High+Station+preferred+caterers+late+night+snack",
    fit_reason: "Venue could use dumplings as late-night bites or cocktail-hour snacks.",
    suggested_pitch: "Pitch dumplings as a memorable late-night snack option for weddings and corporate events.",
    trigger_type: "venue-partnership",
    trigger_reason: "Preferred vendor and event package fit.",
  },
  {
    business_name: "The Source Hotel",
    type: "Hotel / Event Venue",
    channel: "Catering",
    finder_bucket: "corporate-catering",
    address: "RiNo",
    research_query: "The Source Hotel Denver corporate events catering",
    source_url: "https://www.google.com/search?q=The+Source+Hotel+Denver+corporate+events+catering",
    fit_reason: "Hospitality/event footprint creates catering and partnership angles.",
    suggested_pitch: "Pitch dumplings as an event add-on or lobby/tasting activation with local Denver story.",
    trigger_type: "event-calendar",
    trigger_reason: "Hotel/event programming creates recurring catering hooks.",
  },
  {
    business_name: "Campus Lounge",
    type: "Bar",
    channel: "Restaurants",
    finder_bucket: "menu-fit-bars-breweries",
    address: "Denver",
    research_query: "Campus Lounge Denver kitchen manager menu appetizers",
    source_url: "https://www.google.com/search?q=Campus+Lounge+Denver+kitchen+manager+menu+appetizers",
    fit_reason: "Bar menu and neighborhood crowd could support a high-margin shareable appetizer.",
    suggested_pitch: "Lead with a sports-bar-friendly flavor and offer a staff tasting during a slow afternoon.",
  },
  {
    business_name: "Zeppelin Station",
    type: "Food Hall / Restaurant",
    channel: "Restaurants",
    finder_bucket: "new-restaurant-openings",
    address: "RiNo, Denver",
    research_query: "Zeppelin Station Denver new food vendor opening 2026",
    source_url: "https://www.google.com/search?q=Zeppelin+Station+Denver+new+food+vendor",
    fit_reason: "Food hall with rotating vendor slots — newly opened stalls are actively building supplier relationships.",
    suggested_pitch: "Pitch a frozen dumpling offering for kitchen use or a dedicated dumpling concept for an open stall.",
  },
  {
    business_name: "Cerebral Brewing",
    type: "Brewery / Taproom",
    channel: "Restaurants",
    finder_bucket: "taprooms-adding-kitchen",
    address: "Denver",
    research_query: "Cerebral Brewing Denver taproom kitchen food menu",
    source_url: "https://www.google.com/search?q=Cerebral+Brewing+Denver+taproom+kitchen+food+menu",
    fit_reason: "Craft brewery expanding food program — actively sourcing menu items that pair with beer.",
    suggested_pitch: "Pitch dumplings as a shareable kitchen item with craft beer pairings built into the menu copy.",
    trigger_type: "taproom-kitchen-expansion",
    trigger_reason: "Taproom adding food program creates an immediate vendor opening.",
  },
  {
    business_name: "Denver Night Market",
    type: "Food Festival / Market",
    channel: "Catering",
    finder_bucket: "food-festival-market-vendors",
    address: "Denver",
    research_query: "Denver Night Market food vendor 2026 apply",
    source_url: "https://www.google.com/search?q=Denver+Night+Market+food+vendor+2026",
    fit_reason: "Seasonal market with rotating food vendors — attendees are qualified food businesses.",
    suggested_pitch: "Reach out to confirmed vendors as catering accounts, or apply as a vendor directly.",
    trigger_type: "event-calendar",
    trigger_reason: "Market season creates a recurring prospecting window each spring/summer.",
  },
  {
    business_name: "The Crawford Hotel",
    type: "Boutique Hotel",
    channel: "Catering",
    finder_bucket: "boutique-hotel-venue-fb",
    address: "Denver Union Station",
    research_query: "The Crawford Hotel Denver F&B catering events",
    source_url: "https://www.google.com/search?q=Crawford+Hotel+Denver+catering+events+F%26B",
    fit_reason: "High-end boutique hotel with in-house restaurant and event space — recurring catering volume.",
    suggested_pitch: "Pitch dumplings as a cocktail-hour or late-night event bite with local Colorado brand story.",
  },
  {
    business_name: "Rocky Road Dumplings",
    type: "Food Truck",
    channel: "Food Truck",
    finder_bucket: "food-truck-new-permits",
    address: "Denver",
    research_query: "Denver new food truck permit 2026 launching",
    source_url: "https://www.google.com/search?q=Denver+new+food+truck+permit+2026",
    fit_reason: "New food truck launching and actively sourcing initial product suppliers — pre-locked-in relationship.",
    suggested_pitch: "Lead with product reliability, consistent supply, and a co-marketing angle for launch promotion.",
    trigger_type: "new-permit",
    trigger_reason: "Pre-launch window — supplier decisions not yet finalized.",
  },
];

export function getFinderBuckets() {
  return FINDER_BUCKETS;
}

export function buildFinderProspects(existingAccounts: AnyAccount[], existingProspects: Prospect[]) {
  const existingNames = new Set([
    ...existingAccounts.map((account) => normalizeAccountName(account.account)),
    ...existingProspects.map((prospect) => normalizeAccountName(prospect.business_name)),
  ]);

  const now = new Date().toISOString();
  return SEEDS
    .filter((seed) => !existingNames.has(normalizeAccountName(seed.business_name)))
    .map((seed) => enrichProspect({
      ...seed,
      notes: seed.notes ?? "",
      source: "finder",
      status: seed.trigger_type ? "triggered" : "new",
      added_to_sheet: false,
      trigger_date: seed.trigger_type ? now : null,
    }));
}

export function enrichProspect(input: Partial<Prospect> & { business_name: string }): Partial<Prospect> {
  const joined = [
    input.business_name,
    input.type,
    input.channel,
    input.address,
    input.fit_reason,
    input.trigger_reason,
  ].join(" ").toLowerCase();

  let fitScore = 55;
  if (joined.includes("brewery") || joined.includes("bar")) fitScore += 12;
  if (joined.includes("specialty") || joined.includes("grocery") || joined.includes("local")) fitScore += 14;
  if (joined.includes("event") || joined.includes("wedding") || joined.includes("corporate")) fitScore += 10;
  if (joined.includes("food truck") || joined.includes("calendar")) fitScore += 8;
  if (input.website || input.source_url) fitScore += 5;
  fitScore = Math.min(96, fitScore);

  const confidenceScore = Math.min(
    95,
    35 +
      (input.source_url ? 20 : 0) +
      (input.website ? 15 : 0) +
      (input.address ? 10 : 0) +
      (input.fit_reason ? 10 : 0) +
      (input.suggested_pitch ? 5 : 0)
  );

  return {
    ...input,
    fit_score: input.fit_score ?? fitScore,
    confidence_score: input.confidence_score ?? confidenceScore,
    status: input.status ?? "enriched",
    fit_reason: input.fit_reason ?? inferFitReason(input),
    suggested_pitch: input.suggested_pitch ?? inferPitch(input),
    last_enriched_at: new Date().toISOString(),
  };
}

function inferFitReason(input: Partial<Prospect>) {
  const channel = input.channel || input.type || "account";
  return `Looks like a ${channel} prospect with potential fit for a local dumpling product. Verify decision-maker and buying path before outreach.`;
}

function inferPitch(input: Partial<Prospect>) {
  if ((input.channel || "").toLowerCase().includes("retail")) {
    return "Pitch a small frozen case trial, local brand story, and sampling support.";
  }
  if ((input.channel || "").toLowerCase().includes("catering")) {
    return "Pitch dumplings as a memorable office/event bite with simple ordering and strong local story.";
  }
  if ((input.channel || "").toLowerCase().includes("food")) {
    return "Pitch a recurring pop-up or food truck slot with fast service and beer-friendly flavors.";
  }
  return "Pitch a tasting first, then narrow to the best recurring sales path.";
}
