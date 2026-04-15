import { AnyAccount } from "@/types/accounts";

export interface SalesPlaybook {
  id: string;
  title: string;
  strategy: string;
  bestFit: string;
  talkTrack: string[];
  qualification: string[];
  nextActions: string[];
  warningFlags: string[];
}

const PLAYBOOKS: SalesPlaybook[] = [
  {
    id: "brewery-no-kitchen",
    title: "Brewery Without Kitchen",
    strategy: "Lead with low-lift food coverage, brand fit, and sample momentum.",
    bestFit: "Breweries and bars that need consistent food without a full kitchen buildout.",
    talkTrack: [
      "Position Radical Sasquatch as a local brand that gives guests a memorable food option.",
      "Keep the operational pitch simple: fast service, strong margins, easy staff training.",
      "Use sample drops as the fastest path to a real yes.",
    ],
    qualification: [
      "Who owns vendor decisions?",
      "Do they need daily food coverage or event-based support?",
      "Are there service constraints from kitchen space or staffing?",
    ],
    nextActions: [
      "Send brewery-specific intro email.",
      "Book a sample drop within 7 days.",
      "Follow up with menu, pricing, and operating model after samples.",
    ],
    warningFlags: [
      "They already have a strong food truck rotation they love.",
      "No clear owner of vendor decisions.",
      "They only want seasonal or one-off event support.",
    ],
  },
  {
    id: "retail-buyer",
    title: "Retail Buyer",
    strategy: "Anchor on sell-through, freezer fit, and reorder confidence.",
    bestFit: "Retail buyers and specialty stores evaluating freezer product additions.",
    talkTrack: [
      "Lead with product quality, local story, and shopper appeal.",
      "Ask about freezer footprint, reorder cadence, and buyer timing.",
      "Make the buyer’s next step easy with a concise SKU + pricing follow-up.",
    ],
    qualification: [
      "What freezer space is available?",
      "Who owns final assortment approval?",
      "What does their reorder cycle look like?",
    ],
    nextActions: [
      "Send pricing sheet and product snapshot.",
      "Ask for a quick assortment review call.",
      "Schedule a sample tasting if there is real interest.",
    ],
    warningFlags: [
      "No freezer capacity.",
      "Buyer only reviews new products once per quarter.",
      "Need distributor path before direct conversation.",
    ],
  },
  {
    id: "catering-partner",
    title: "Catering Partner",
    strategy: "Sell versatility, event appeal, and execution confidence.",
    bestFit: "Corporate catering teams, event venues, and catering buyers.",
    talkTrack: [
      "Position dumplings as memorable, scalable, and event-friendly.",
      "Highlight ease of planning across private, corporate, and venue events.",
      "Ask about average guest count, event mix, and service style.",
    ],
    qualification: [
      "What event formats do they run most?",
      "What guest counts matter most?",
      "Do they need pickup, staffed service, or packaged delivery?",
    ],
    nextActions: [
      "Send menu + event positioning.",
      "Offer tasting for decision-makers.",
      "Get sample event use case and pricing discussion scheduled.",
    ],
    warningFlags: [
      "Need fully custom menu development before trial.",
      "No clear event volume.",
      "Decision-maker is insulated behind coordinator layer.",
    ],
  },
  {
    id: "food-truck-partner",
    title: "Food Truck Partner",
    strategy: "Focus on collaborative programming, menu fit, and shared audience upside.",
    bestFit: "Food truck operators or partners for co-branded/event opportunities.",
    talkTrack: [
      "Lead with event fit and menu complementarity.",
      "Keep the collaboration simple and specific.",
      "Find out whether this is recurring, event-based, or trial-only.",
    ],
    qualification: [
      "Is this recurring or event-specific?",
      "Who handles scheduling and menu approvals?",
      "What kind of service model works best?",
    ],
    nextActions: [
      "Confirm the event or trial format.",
      "Share menu concepts and logistics.",
      "Book a follow-up on exact schedule and responsibilities.",
    ],
    warningFlags: [
      "No schedule ownership.",
      "Margins only work for one-off events.",
      "They want a custom concept before first trial.",
    ],
  },
  {
    id: "little-pub-portfolio",
    title: "Little Pub Portfolio",
    strategy: "Win the first location cleanly, then escalate to the broader portfolio conversation.",
    bestFit: "Three Dogs Tavern, Will Call, Spot Bar and Grill, The Hound, The Pioneer, College Inn.",
    talkTrack: [
      "Treat the first win as the proof point for the portfolio.",
      "Document every positive signal that can support the Mark Berzins conversation.",
      "Push for an operationally clean pilot, not a complicated bespoke rollout.",
    ],
    qualification: [
      "Who is championing this location internally?",
      "What would make this a replicable portfolio play?",
      "What metrics or feedback would justify expansion?",
    ],
    nextActions: [
      "Land one account first.",
      "Capture the operating story and early win signals.",
      "Escalate to Mark Berzins with concrete proof.",
    ],
    warningFlags: [
      "Trying to sell the whole portfolio too early.",
      "No champion at the first location.",
      "Pilot location is not a strong fit operationally.",
    ],
  },
  {
    id: "fire-on-the-mountain",
    title: "Fire on the Mountain",
    strategy: "Lead with local brand story and sauce pairing. Do not use heat-and-serve framing.",
    bestFit: "Fire on the Mountain specifically.",
    talkTrack: [
      "Open with local brand story and menu fit.",
      "Talk through sauce pairing and brand alignment.",
      "Keep the experience elevated and product-forward.",
    ],
    qualification: [
      "Who owns menu partnership decisions?",
      "How do they evaluate new menu collaborations?",
      "What would a first successful trial look like for them?",
    ],
    nextActions: [
      "Send a tailored note focused on local story and sauce pairing.",
      "Book a tasting conversation.",
      "Follow up with a custom partnership concept.",
    ],
    warningFlags: [
      "Any heat-and-serve framing.",
      "Generic vendor pitch.",
      "No menu-fit conversation.",
    ],
  },
];

function isRetail(account: AnyAccount) {
  return account._tab === "Retail";
}

function isCatering(account: AnyAccount) {
  return account._tab === "Catering";
}

function isFoodTruck(account: AnyAccount) {
  return account._tab === "Food Truck";
}

function isBreweryLike(account: AnyAccount) {
  const text = `${account.account} ${account.type} ${"location" in account ? account.location : ""}`.toLowerCase();
  return text.includes("brew") || text.includes("beer") || text.includes("taproom") || text.includes("bar");
}

export function getPlaybookForAccount(account: AnyAccount): SalesPlaybook {
  const accountName = account.account.toLowerCase();

  if (accountName.includes("fire on the mountain")) {
    return PLAYBOOKS.find((playbook) => playbook.id === "fire-on-the-mountain")!;
  }

  if (
    [
      "three dogs tavern",
      "will call",
      "spot bar and grill",
      "the hound",
      "the pioneer",
      "college inn",
    ].some((target) => accountName.includes(target))
  ) {
    return PLAYBOOKS.find((playbook) => playbook.id === "little-pub-portfolio")!;
  }

  if (isRetail(account)) {
    return PLAYBOOKS.find((playbook) => playbook.id === "retail-buyer")!;
  }

  if (isCatering(account)) {
    return PLAYBOOKS.find((playbook) => playbook.id === "catering-partner")!;
  }

  if (isFoodTruck(account)) {
    return PLAYBOOKS.find((playbook) => playbook.id === "food-truck-partner")!;
  }

  if (isBreweryLike(account)) {
    return PLAYBOOKS.find((playbook) => playbook.id === "brewery-no-kitchen")!;
  }

  return PLAYBOOKS.find((playbook) => playbook.id === "brewery-no-kitchen")!;
}
