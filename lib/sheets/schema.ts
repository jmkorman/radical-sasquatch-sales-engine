// Column index maps for each Google Sheet tab.
// These are the SINGLE SOURCE OF TRUTH for column positions.
// If columns are reordered in the sheet, update only this file.

export const RESTAURANTS_COLUMNS = {
  ACCOUNT: 0,
  TYPE: 1,
  LOCATION: 2,
  IG: 3,
  WEBSITE: 4,
  KITCHEN: 5,
  DUMPLINGS: 6,
  STATUS: 7,
  NEXT_STEPS: 8,
  CONTACT_DATE: 9,
  CONTACT_NAME: 10,
  PHONE: 11,
  EMAIL: 12,
  EST_MONTHLY_ORDER: 13,
  COMMISSION_PCT: 14,
  NOTES: 15,
} as const;

export const RETAIL_COLUMNS = {
  ACCOUNT: 0,
  TYPE: 1,
  LOCATION: 2,
  IG: 3,
  WEBSITE: 4,
  STATUS: 5,
  NEXT_STEPS: 6,
  CONTACT_DATE: 7,
  BUYER: 8, // = Contact Name
  PHONE: 9,
  EMAIL: 10,
  EST_MONTHLY_ORDER: 11,
  COMMISSION_PCT: 12,
  NOTES: 13,
} as const;

export const CATERING_COLUMNS = {
  ACCOUNT: 0,
  TYPE: 1,
  LOCATION: 2,
  WEBSITE: 3,
  STATUS: 4,
  NEXT_STEPS: 5,
  CONTACT_DATE: 6,
  CONTACT_NAME: 7,
  PHONE: 8,
  EMAIL: 9,
  EST_MONTHLY_ORDER: 10,
  COMMISSION_PCT: 11,
  NOTES: 12,
  IG: 13,
} as const;

export const FOOD_TRUCK_COLUMNS = {
  ACCOUNT: 0,
  TYPE: 1,
  LOCATION: 2,
  WEBSITE: 3,
  STATUS: 4,
  NEXT_STEPS: 5,
  CONTACT_DATE: 6,
  CLIENT: 7, // = Contact Name
  PHONE: 8,
  EMAIL: 9,
  EST_MONTHLY_ORDER: 10,
  COMMISSION_PCT: 11,
  NOTES: 12,
  IG: 13,
  WEBSITE_2: 14,
} as const;

export const ACTIVE_ACCOUNTS_COLUMNS = {
  ACCOUNT: 0,
  TYPE: 1,
  CONTACT_NAME: 2,
  STATUS: 3,
  RS_LEAD: 4,
  CONTACT_DATE: 5,
  NEXT_STEPS: 6,
  PHONE: 7,
  EMAIL: 8,
  ORDER: 9,
  NOTES: 10,
} as const;

// Convert 0-based column index to A1 notation letter
export function indexToColumnLetter(index: number): string {
  let letter = "";
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

// Get the status column index for a given tab
export function getStatusColumnIndex(tab: string): number {
  switch (tab) {
    case "Restaurants": return RESTAURANTS_COLUMNS.STATUS;
    case "Retail": return RETAIL_COLUMNS.STATUS;
    case "Catering": return CATERING_COLUMNS.STATUS;
    case "Food Truck": return FOOD_TRUCK_COLUMNS.STATUS;
    case "Active Accounts": return ACTIVE_ACCOUNTS_COLUMNS.STATUS;
    default: throw new Error(`Unknown tab: ${tab}`);
  }
}

// Get the contact date column index for a given tab
export function getContactDateColumnIndex(tab: string): number {
  switch (tab) {
    case "Restaurants": return RESTAURANTS_COLUMNS.CONTACT_DATE;
    case "Retail": return RETAIL_COLUMNS.CONTACT_DATE;
    case "Catering": return CATERING_COLUMNS.CONTACT_DATE;
    case "Food Truck": return FOOD_TRUCK_COLUMNS.CONTACT_DATE;
    case "Active Accounts": return ACTIVE_ACCOUNTS_COLUMNS.CONTACT_DATE;
    default: throw new Error(`Unknown tab: ${tab}`);
  }
}

// Get the next steps column index for a given tab
export function getNextStepsColumnIndex(tab: string): number {
  switch (tab) {
    case "Restaurants": return RESTAURANTS_COLUMNS.NEXT_STEPS;
    case "Retail": return RETAIL_COLUMNS.NEXT_STEPS;
    case "Catering": return CATERING_COLUMNS.NEXT_STEPS;
    case "Food Truck": return FOOD_TRUCK_COLUMNS.NEXT_STEPS;
    case "Active Accounts": return ACTIVE_ACCOUNTS_COLUMNS.NEXT_STEPS;
    default: throw new Error(`Unknown tab: ${tab}`);
  }
}

// Get the notes column index for a given tab
export function getNotesColumnIndex(tab: string): number {
  switch (tab) {
    case "Restaurants": return RESTAURANTS_COLUMNS.NOTES;
    case "Retail": return RETAIL_COLUMNS.NOTES;
    case "Catering": return CATERING_COLUMNS.NOTES;
    case "Food Truck": return FOOD_TRUCK_COLUMNS.NOTES;
    case "Active Accounts": return ACTIVE_ACCOUNTS_COLUMNS.NOTES;
    default: throw new Error(`Unknown tab: ${tab}`);
  }
}
