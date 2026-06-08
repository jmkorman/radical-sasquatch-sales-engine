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

export function getAccountColumnIndex(tab: string): number {
  switch (tab) {
    case "Restaurants": return RESTAURANTS_COLUMNS.ACCOUNT;
    case "Retail": return RETAIL_COLUMNS.ACCOUNT;
    case "Catering": return CATERING_COLUMNS.ACCOUNT;
    case "Food Truck": return FOOD_TRUCK_COLUMNS.ACCOUNT;
    case "Active Accounts": return ACTIVE_ACCOUNTS_COLUMNS.ACCOUNT;
    default: throw new Error(`Unknown tab: ${tab}`);
  }
}

export function getTypeColumnIndex(tab: string): number {
  switch (tab) {
    case "Restaurants": return RESTAURANTS_COLUMNS.TYPE;
    case "Retail": return RETAIL_COLUMNS.TYPE;
    case "Catering": return CATERING_COLUMNS.TYPE;
    case "Food Truck": return FOOD_TRUCK_COLUMNS.TYPE;
    case "Active Accounts": return ACTIVE_ACCOUNTS_COLUMNS.TYPE;
    default: throw new Error(`Unknown tab: ${tab}`);
  }
}

export function getLocationColumnIndex(tab: string): number {
  switch (tab) {
    case "Restaurants": return RESTAURANTS_COLUMNS.LOCATION;
    case "Retail": return RETAIL_COLUMNS.LOCATION;
    case "Catering": return CATERING_COLUMNS.LOCATION;
    case "Food Truck": return FOOD_TRUCK_COLUMNS.LOCATION;
    default: throw new Error(`Location column not available for tab: ${tab}`);
  }
}

export function getPhoneColumnIndex(tab: string): number {
  switch (tab) {
    case "Restaurants": return RESTAURANTS_COLUMNS.PHONE;
    case "Retail": return RETAIL_COLUMNS.PHONE;
    case "Catering": return CATERING_COLUMNS.PHONE;
    case "Food Truck": return FOOD_TRUCK_COLUMNS.PHONE;
    case "Active Accounts": return ACTIVE_ACCOUNTS_COLUMNS.PHONE;
    default: throw new Error(`Unknown tab: ${tab}`);
  }
}

export function getEmailColumnIndex(tab: string): number {
  switch (tab) {
    case "Restaurants": return RESTAURANTS_COLUMNS.EMAIL;
    case "Retail": return RETAIL_COLUMNS.EMAIL;
    case "Catering": return CATERING_COLUMNS.EMAIL;
    case "Food Truck": return FOOD_TRUCK_COLUMNS.EMAIL;
    case "Active Accounts": return ACTIVE_ACCOUNTS_COLUMNS.EMAIL;
    default: throw new Error(`Unknown tab: ${tab}`);
  }
}

export function getOrderColumnIndex(tab: string): number {
  switch (tab) {
    case "Active Accounts": return ACTIVE_ACCOUNTS_COLUMNS.ORDER;
    default: throw new Error(`Order column not available for tab: ${tab}`);
  }
}

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

// Get the contact name column index for a given tab (CONTACT_NAME, BUYER, CLIENT, etc.)
export function getContactNameColumnIndex(tab: string): number {
  switch (tab) {
    case "Restaurants": return RESTAURANTS_COLUMNS.CONTACT_NAME;
    case "Retail": return RETAIL_COLUMNS.BUYER;
    case "Catering": return CATERING_COLUMNS.CONTACT_NAME;
    case "Food Truck": return FOOD_TRUCK_COLUMNS.CLIENT;
    case "Active Accounts": return ACTIVE_ACCOUNTS_COLUMNS.CONTACT_NAME;
    default: throw new Error(`Unknown tab: ${tab}`);
  }
}

// ---------------------------------------------------------------------------
// Header-row validation (Risk 4 in ENGINE_AUDIT.md).
//
// All column maps above are hardcoded zero-based offsets. If anyone inserts,
// deletes, or renames a column in the live Google Sheet, every read and
// every write that uses the wrong offset will silently corrupt data with no
// error surfaced to the user.
//
// The validator below checks that the live header row's text at each mapped
// column index loosely contains the expected label. This is a loose substring
// match (case-insensitive, punctuation-normalized) so harmless rewordings
// like "Account Name" vs "Account" or "Phone #" vs "Phone" still pass — but
// a structural insertion/deletion that shifts column positions fails loudly.
//
// Set SHEET_HEADER_VALIDATION="off" in env to bypass this guard if the
// expected labels need to be updated and you can't deploy a code change.
// ---------------------------------------------------------------------------

export type ExpectedHeaderMap = Record<number, string>;

// Each entry: { column index => substring the live header at that index
// must contain (after normalization) }. Keep these conservative — they only
// need to disambiguate the column from its neighbours.
export const RESTAURANTS_HEADERS: ExpectedHeaderMap = {
  [RESTAURANTS_COLUMNS.ACCOUNT]: "account",
  [RESTAURANTS_COLUMNS.TYPE]: "type",
  [RESTAURANTS_COLUMNS.LOCATION]: "location",
  [RESTAURANTS_COLUMNS.IG]: "ig",
  [RESTAURANTS_COLUMNS.WEBSITE]: "website",
  [RESTAURANTS_COLUMNS.KITCHEN]: "kitchen",
  [RESTAURANTS_COLUMNS.DUMPLINGS]: "dumpling",
  [RESTAURANTS_COLUMNS.STATUS]: "status",
  [RESTAURANTS_COLUMNS.NEXT_STEPS]: "next",
  [RESTAURANTS_COLUMNS.CONTACT_DATE]: "contact",
  [RESTAURANTS_COLUMNS.CONTACT_NAME]: "contact",
  [RESTAURANTS_COLUMNS.PHONE]: "phone",
  [RESTAURANTS_COLUMNS.EMAIL]: "email",
  [RESTAURANTS_COLUMNS.EST_MONTHLY_ORDER]: "monthly",
  [RESTAURANTS_COLUMNS.COMMISSION_PCT]: "commission",
  [RESTAURANTS_COLUMNS.NOTES]: "notes",
};

export const RETAIL_HEADERS: ExpectedHeaderMap = {
  [RETAIL_COLUMNS.ACCOUNT]: "account",
  [RETAIL_COLUMNS.TYPE]: "type",
  [RETAIL_COLUMNS.LOCATION]: "location",
  [RETAIL_COLUMNS.IG]: "ig",
  [RETAIL_COLUMNS.WEBSITE]: "website",
  [RETAIL_COLUMNS.STATUS]: "status",
  [RETAIL_COLUMNS.NEXT_STEPS]: "next",
  [RETAIL_COLUMNS.CONTACT_DATE]: "contact",
  [RETAIL_COLUMNS.BUYER]: "buyer",
  [RETAIL_COLUMNS.PHONE]: "phone",
  [RETAIL_COLUMNS.EMAIL]: "email",
  [RETAIL_COLUMNS.EST_MONTHLY_ORDER]: "monthly",
  [RETAIL_COLUMNS.COMMISSION_PCT]: "commission",
  [RETAIL_COLUMNS.NOTES]: "notes",
};

export const CATERING_HEADERS: ExpectedHeaderMap = {
  [CATERING_COLUMNS.ACCOUNT]: "account",
  [CATERING_COLUMNS.TYPE]: "type",
  [CATERING_COLUMNS.LOCATION]: "location",
  [CATERING_COLUMNS.WEBSITE]: "website",
  [CATERING_COLUMNS.STATUS]: "status",
  [CATERING_COLUMNS.NEXT_STEPS]: "next",
  [CATERING_COLUMNS.CONTACT_DATE]: "contact",
  [CATERING_COLUMNS.CONTACT_NAME]: "contact",
  [CATERING_COLUMNS.PHONE]: "phone",
  [CATERING_COLUMNS.EMAIL]: "email",
  [CATERING_COLUMNS.EST_MONTHLY_ORDER]: "monthly",
  [CATERING_COLUMNS.COMMISSION_PCT]: "commission",
  [CATERING_COLUMNS.NOTES]: "notes",
  [CATERING_COLUMNS.IG]: "ig",
};

export const FOOD_TRUCK_HEADERS: ExpectedHeaderMap = {
  [FOOD_TRUCK_COLUMNS.ACCOUNT]: "account",
  [FOOD_TRUCK_COLUMNS.TYPE]: "type",
  [FOOD_TRUCK_COLUMNS.LOCATION]: "location",
  [FOOD_TRUCK_COLUMNS.WEBSITE]: "website",
  [FOOD_TRUCK_COLUMNS.STATUS]: "status",
  [FOOD_TRUCK_COLUMNS.NEXT_STEPS]: "next",
  [FOOD_TRUCK_COLUMNS.CONTACT_DATE]: "contact",
  [FOOD_TRUCK_COLUMNS.CLIENT]: "client",
  [FOOD_TRUCK_COLUMNS.PHONE]: "phone",
  [FOOD_TRUCK_COLUMNS.EMAIL]: "email",
  [FOOD_TRUCK_COLUMNS.EST_MONTHLY_ORDER]: "monthly",
  [FOOD_TRUCK_COLUMNS.COMMISSION_PCT]: "commission",
  [FOOD_TRUCK_COLUMNS.NOTES]: "notes",
  [FOOD_TRUCK_COLUMNS.IG]: "ig",
};

export const ACTIVE_ACCOUNTS_HEADERS: ExpectedHeaderMap = {
  [ACTIVE_ACCOUNTS_COLUMNS.ACCOUNT]: "account",
  [ACTIVE_ACCOUNTS_COLUMNS.TYPE]: "type",
  [ACTIVE_ACCOUNTS_COLUMNS.CONTACT_NAME]: "contact",
  [ACTIVE_ACCOUNTS_COLUMNS.STATUS]: "status",
  [ACTIVE_ACCOUNTS_COLUMNS.RS_LEAD]: "lead",
  [ACTIVE_ACCOUNTS_COLUMNS.CONTACT_DATE]: "contact",
  [ACTIVE_ACCOUNTS_COLUMNS.NEXT_STEPS]: "next",
  [ACTIVE_ACCOUNTS_COLUMNS.PHONE]: "phone",
  [ACTIVE_ACCOUNTS_COLUMNS.EMAIL]: "email",
  [ACTIVE_ACCOUNTS_COLUMNS.ORDER]: "order",
  [ACTIVE_ACCOUNTS_COLUMNS.NOTES]: "notes",
};

export function getExpectedHeaders(tab: string): ExpectedHeaderMap | null {
  switch (tab) {
    case "Restaurants": return RESTAURANTS_HEADERS;
    case "Retail": return RETAIL_HEADERS;
    case "Catering": return CATERING_HEADERS;
    case "Food Truck": return FOOD_TRUCK_HEADERS;
    case "Active Accounts": return ACTIVE_ACCOUNTS_HEADERS;
    default: return null;
  }
}

export function normalizeHeaderText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[._\-/]/g, " ")
    .replace(/[^a-z0-9 %]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class SheetHeaderMismatchError extends Error {
  constructor(
    public readonly tab: string,
    public readonly errors: string[]
  ) {
    super(
      `Google Sheet "${tab}" header row does not match expected schema. ` +
        `A column may have been inserted, removed, or renamed. ` +
        `Fix the sheet or update lib/sheets/schema.ts. ` +
        `Set SHEET_HEADER_VALIDATION=off to bypass.\n  - ${errors.join("\n  - ")}`
    );
    this.name = "SheetHeaderMismatchError";
  }
}

export interface HeaderValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateHeaderRow(
  tab: string,
  headerRow: ReadonlyArray<unknown>
): HeaderValidationResult {
  const expected = getExpectedHeaders(tab);
  if (!expected) return { ok: true, errors: [] };

  const errors: string[] = [];
  if (!headerRow || headerRow.length === 0) {
    return {
      ok: false,
      errors: [`Header row is missing or empty for tab "${tab}".`],
    };
  }

  for (const [idxStr, want] of Object.entries(expected)) {
    const idx = Number(idxStr);
    const raw = headerRow[idx];
    const actual = normalizeHeaderText(raw);
    const expectedToken = normalizeHeaderText(want);
    if (!actual || !actual.includes(expectedToken)) {
      errors.push(
        `Column ${idx} should contain "${want}" but found "${raw ?? ""}"`
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertHeaderRow(tab: string, headerRow: ReadonlyArray<unknown>): void {
  const result = validateHeaderRow(tab, headerRow);
  if (!result.ok) throw new SheetHeaderMismatchError(tab, result.errors);
}

export function headerValidationEnabled(): boolean {
  return (process.env.SHEET_HEADER_VALIDATION ?? "").toLowerCase() !== "off";
}
