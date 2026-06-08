// Tests for the header-row validation guard (Risk 4).
// We never call the live Sheets API here — these tests exercise the pure
// validation functions exported from lib/sheets/schema.ts.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalizeHeaderText,
  validateHeaderRow,
  assertHeaderRow,
  SheetHeaderMismatchError,
  headerValidationEnabled,
  getExpectedHeaders,
  RESTAURANTS_COLUMNS,
} from "./schema";

const ORIGINAL_ENV = process.env.SHEET_HEADER_VALIDATION;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.SHEET_HEADER_VALIDATION;
  else process.env.SHEET_HEADER_VALIDATION = ORIGINAL_ENV;
});

describe("normalizeHeaderText", () => {
  it("lowercases and trims", () => {
    expect(normalizeHeaderText("  Account Name  ")).toBe("account name");
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(normalizeHeaderText("Phone #")).toBe("phone");
    // "-" and "/" both normalize to a single space, so the word boundaries
    // are preserved. Substring matching against "email" still works because
    // validateHeaderRow checks `.includes()` after both sides normalize.
    expect(normalizeHeaderText("E-mail/Address")).toBe("e mail address");
    expect(normalizeHeaderText("Est. Monthly Order ($)")).toBe(
      "est monthly order"
    );
  });

  it("treats null/undefined as empty", () => {
    expect(normalizeHeaderText(null)).toBe("");
    expect(normalizeHeaderText(undefined)).toBe("");
  });

  it("preserves % so commission columns still match", () => {
    expect(normalizeHeaderText("Commission %")).toBe("commission %");
  });
});

describe("validateHeaderRow", () => {
  // The canonical Restaurants header row as the live sheet has it today.
  const goodRestaurants = [
    "Account",
    "Type",
    "Location",
    "IG",
    "Website",
    "Kitchen",
    "Dumplings",
    "Status",
    "Next Steps",
    "Contact Date",
    "Contact Name",
    "Phone",
    "Email",
    "Est. Monthly Order",
    "Commission %",
    "Notes",
  ];

  it("returns ok for the exact expected header row", () => {
    const result = validateHeaderRow("Restaurants", goodRestaurants);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts harmless rewordings (substring match)", () => {
    const reworded = [...goodRestaurants];
    reworded[RESTAURANTS_COLUMNS.ACCOUNT] = "Account Name"; // contains "account"
    reworded[RESTAURANTS_COLUMNS.PHONE] = "Phone #";
    reworded[RESTAURANTS_COLUMNS.EMAIL] = "Email Address";
    const result = validateHeaderRow("Restaurants", reworded);
    expect(result.ok).toBe(true);
  });

  it("fails loud when a column is shifted (insertion)", () => {
    // Simulate someone inserting a "Region" column before Type.
    const shifted = [
      "Account",
      "Region", // inserted
      "Type",
      "Location",
      "IG",
      "Website",
      "Kitchen",
      "Dumplings",
      "Status",
      "Next Steps",
      "Contact Date",
      "Contact Name",
      "Phone",
      "Email",
      "Est. Monthly Order",
      "Commission %",
    ];
    const result = validateHeaderRow("Restaurants", shifted);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // The Type column (index 1) should report it found "Region" instead.
    expect(result.errors.some((e) => e.includes("Region"))).toBe(true);
  });

  it("returns a single error when the header row is empty", () => {
    const result = validateHeaderRow("Restaurants", []);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/missing or empty/i);
  });

  it("returns ok for an unknown tab (no expected map)", () => {
    const result = validateHeaderRow("Bogus Tab", ["whatever"]);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("assertHeaderRow", () => {
  it("throws SheetHeaderMismatchError when columns shifted", () => {
    expect(() =>
      assertHeaderRow("Restaurants", [
        "Account",
        "Region", // shifted
        "Type",
      ])
    ).toThrow(SheetHeaderMismatchError);
  });

  it("includes the bypass hint in the error message", () => {
    try {
      assertHeaderRow("Restaurants", ["Account"]);
      throw new Error("should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("SHEET_HEADER_VALIDATION=off");
      expect(msg).toContain("Restaurants");
    }
  });

  it("does not throw for a valid header row", () => {
    const good = [
      "Account",
      "Type",
      "Location",
      "IG",
      "Website",
      "Kitchen",
      "Dumplings",
      "Status",
      "Next Steps",
      "Contact Date",
      "Contact Name",
      "Phone",
      "Email",
      "Est. Monthly Order",
      "Commission %",
      "Notes",
    ];
    expect(() => assertHeaderRow("Restaurants", good)).not.toThrow();
  });
});

describe("headerValidationEnabled", () => {
  beforeEach(() => {
    delete process.env.SHEET_HEADER_VALIDATION;
  });

  it("defaults to enabled when env var is unset", () => {
    expect(headerValidationEnabled()).toBe(true);
  });

  it("respects SHEET_HEADER_VALIDATION=off (case insensitive)", () => {
    process.env.SHEET_HEADER_VALIDATION = "off";
    expect(headerValidationEnabled()).toBe(false);
    process.env.SHEET_HEADER_VALIDATION = "OFF";
    expect(headerValidationEnabled()).toBe(false);
  });

  it("treats any other value as enabled", () => {
    process.env.SHEET_HEADER_VALIDATION = "on";
    expect(headerValidationEnabled()).toBe(true);
    process.env.SHEET_HEADER_VALIDATION = "true";
    expect(headerValidationEnabled()).toBe(true);
  });
});

describe("getExpectedHeaders", () => {
  it("returns maps for every supported tab", () => {
    expect(getExpectedHeaders("Restaurants")).toBeTruthy();
    expect(getExpectedHeaders("Retail")).toBeTruthy();
    expect(getExpectedHeaders("Catering")).toBeTruthy();
    expect(getExpectedHeaders("Food Truck")).toBeTruthy();
    expect(getExpectedHeaders("Active Accounts")).toBeTruthy();
  });

  it("returns null for unknown tabs", () => {
    expect(getExpectedHeaders("Bogus")).toBeNull();
    expect(getExpectedHeaders("")).toBeNull();
  });
});
