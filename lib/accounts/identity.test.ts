import { describe, expect, it } from "vitest";
import {
  buildStableAccountId,
  normalizeAccountName,
  normalizeTabId,
} from "@/lib/accounts/identity";

describe("normalizeAccountName / normalizeTabId", () => {
  it("lowercases and replaces non-alphanumerics with single hyphens", () => {
    expect(normalizeAccountName("Harmon's Grocery!")).toBe("harmon-s-grocery");
  });

  it("replaces & with 'and'", () => {
    expect(normalizeAccountName("Black & White")).toBe("black-and-white");
  });

  it("trims leading and trailing hyphens", () => {
    expect(normalizeAccountName("  Hello, World  ")).toBe("hello-world");
  });

  it("collapses runs of non-alphanumerics into one hyphen", () => {
    expect(normalizeAccountName("A___B---C")).toBe("a-b-c");
  });

  it("normalizeTabId behaves the same as account name", () => {
    expect(normalizeTabId("Active Accounts")).toBe("active-accounts");
  });
});

describe("buildStableAccountId", () => {
  it("formats as ${tabSlug}:${normalizedName}", () => {
    expect(buildStableAccountId("Restaurants", "Harmons")).toBe("restaurants:harmons");
  });

  it("changes when the name changes (this is the rename-cascade trigger)", () => {
    const before = buildStableAccountId("Restaurants", "Harmons");
    const after = buildStableAccountId("Restaurants", "Harmons West");
    expect(before).not.toBe(after);
  });

  it("changes when the tab changes (this is the move/retab trigger)", () => {
    const restaurants = buildStableAccountId("Restaurants", "Harmons");
    const retail = buildStableAccountId("Retail", "Harmons");
    expect(restaurants).not.toBe(retail);
  });

  it("is stable across casing/punctuation variations of the same name", () => {
    const a = buildStableAccountId("Restaurants", "Harmon's");
    const b = buildStableAccountId("restaurants", "Harmon's");
    expect(a).toBe(b);
  });
});
