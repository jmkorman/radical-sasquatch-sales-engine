import { StatusValue, TabName, TabSlug } from "@/types/accounts";

export const STATUS_VALUES: StatusValue[] = [
  "",
  "Identified",
  "Researched",
  "Contacted",
  "Following Up",
  "Closed - Won",
];

export const TAB_NAMES: TabName[] = [
  "Restaurants",
  "Retail",
  "Catering",
  "Food Truck",
  "Active Accounts",
];

export const TAB_SLUG_MAP: Record<TabSlug, TabName> = {
  restaurants: "Restaurants",
  retail: "Retail",
  catering: "Catering",
  "food-truck": "Food Truck",
  "active-accounts": "Active Accounts",
};

export const TAB_NAME_TO_SLUG: Record<TabName, TabSlug> = {
  Restaurants: "restaurants",
  Retail: "retail",
  Catering: "catering",
  "Food Truck": "food-truck",
  "Active Accounts": "active-accounts",
};

export const STATUS_COLORS: Record<string, string> = {
  Identified: "bg-status-identified",
  Researched: "bg-status-researched",
  Contacted: "bg-status-contacted",
  "Following Up": "bg-status-following",
  "Closed - Won": "bg-status-won",
  "": "bg-gray-600",
};

export const PITCH_RULES = [
  {
    match: ["Fire on the Mountain"],
    message:
      "Lead with local brand story and sauce pairing angle. Never use heat and serve framing.",
  },
  {
    match: [
      "Little Pub Company",
      "Three Dogs Tavern",
      "Will Call",
      "Spot Bar and Grill",
      "The Hound",
      "The Pioneer",
      "College Inn",
    ],
    message:
      "Land this account first, then escalate to Mark Berzins for a portfolio conversation.",
  },
];
