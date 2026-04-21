import { StatusValue, TabName, TabSlug } from "@/types/accounts";

// Current pipeline stages shown in dropdowns (food-sales model)
export const STATUS_VALUES: StatusValue[] = [
  "Identified",
  "Reached Out",
  "Connected",
  "Sample Sent",
  "Tasting Complete",
  "Decision Pending",
  "Backburner",
  "Not a Fit",
];

// All status values including legacy (for display/filtering existing data)
export const ALL_STATUS_VALUES: StatusValue[] = [
  ...STATUS_VALUES,
  "Researched",
  "Contacted",
  "Following Up",
  "Closed - Won",
  "Not Interested",
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
  // Current stages
  Identified:          "bg-status-identified",
  "Reached Out":       "bg-status-reached",
  Connected:           "bg-status-connected",
  "Sample Sent":       "bg-status-sample",
  "Tasting Complete":  "bg-status-tasting",
  "Decision Pending":  "bg-status-decision",
  Backburner:          "bg-gray-600",
  "Not a Fit":         "bg-red-900",
  // Legacy
  Researched:          "bg-status-researched",
  Contacted:           "bg-status-contacted",
  "Following Up":      "bg-status-following",
  "Closed - Won":      "bg-status-won",
  "Not Interested":    "bg-red-900",
  "":                  "bg-gray-600",
};

// Structured next action types
export const NEXT_ACTION_TYPES = [
  { value: "cold-outreach",    label: "Cold Outreach",     color: "#6f64a8" },
  { value: "follow-up-call",   label: "Follow-Up Call",    color: "#4d8cff" },
  { value: "send-sample",      label: "Send Sample",       color: "#64f5ea" },
  { value: "schedule-tasting", label: "Schedule Tasting",  color: "#a78bfa" },
  { value: "get-feedback",     label: "Get Feedback",      color: "#f97316" },
  { value: "send-pricing",     label: "Send Pricing",      color: "#ffb321" },
  { value: "close-decision",   label: "Close Decision",    color: "#ff4f9f" },
] as const;

export type NextActionType = typeof NEXT_ACTION_TYPES[number]["value"];

// Channel-specific urgency thresholds (days since last contact)
export const CHANNEL_URGENCY_THRESHOLDS: Record<string, { hot: number; warm: number; cooling: number; stale: number }> = {
  restaurants:  { hot: 2,  warm: 5,  cooling: 10, stale: 14 },
  retail:       { hot: 5,  warm: 14, cooling: 30, stale: 45 },
  catering:     { hot: 3,  warm: 7,  cooling: 21, stale: 30 },
  "food-truck": { hot: 2,  warm: 5,  cooling: 10, stale: 14 },
  default:      { hot: 2,  warm: 7,  cooling: 14, stale: 21 },
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
