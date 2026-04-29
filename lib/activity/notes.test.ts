import { describe, expect, it } from "vitest";
import { parseActivityNote, formatActivityNote, GMAIL_DETAILS_DISPLAY_CAP } from "./notes";

describe("parseActivityNote", () => {
  it("returns all-null for empty input", () => {
    expect(parseActivityNote(null)).toEqual({
      summary: null,
      details: null,
      objection: null,
      nextStep: null,
    });
    expect(parseActivityNote("")).toEqual({
      summary: null,
      details: null,
      objection: null,
      nextStep: null,
    });
  });

  it("parses a simple structured note", () => {
    const note = "SUMMARY: Met Sandra\nDETAILS: She liked the dumplings\nNEXT: Send pricing Monday";
    const parsed = parseActivityNote(note);
    expect(parsed.summary).toBe("Met Sandra");
    expect(parsed.details).toBe("She liked the dumplings");
    expect(parsed.nextStep).toBe("Send pricing Monday");
  });

  it("captures multi-line DETAILS without truncating at the first newline", () => {
    const note = [
      "SUMMARY: Met Sandra at Tony's",
      "DETAILS: General",
      "",
      "Met Sandra at the Tony's Commissary office",
      "She was very interested in the product",
      "",
      "Logistics & Terms",
      "$20 delivery fee - she was fine with it",
      "4-case minimum - she was fine with it",
      "NEXT: Follow up next week",
    ].join("\n");

    const parsed = parseActivityNote(note);
    expect(parsed.summary).toBe("Met Sandra at Tony's");
    expect(parsed.details).toContain("Met Sandra at the Tony's Commissary office");
    expect(parsed.details).toContain("4-case minimum");
    expect(parsed.details).not.toContain("Follow up next week"); // shouldn't bleed into NEXT
    expect(parsed.nextStep).toBe("Follow up next week");
  });

  it("captures multi-line OBJECTION", () => {
    const note = [
      "SUMMARY: Pitch went mixed",
      "DETAILS: Showed product, walked through pricing",
      "OBJECTION: Price felt high for their volume",
      "Also worried about freezer space",
      "NEXT: Send pricing tier sheet",
    ].join("\n");

    const parsed = parseActivityNote(note);
    expect(parsed.objection).toBe("Price felt high for their volume\nAlso worried about freezer space");
    expect(parsed.nextStep).toBe("Send pricing tier sheet");
  });

  it("captures multi-line NEXT", () => {
    const note = [
      "SUMMARY: Tasting confirmed",
      "DETAILS: Loved everything",
      "NEXT: Send pricing Monday",
      "Then call Tuesday",
      "Drop additional samples Thursday",
    ].join("\n");

    const parsed = parseActivityNote(note);
    expect(parsed.nextStep).toBe(
      "Send pricing Monday\nThen call Tuesday\nDrop additional samples Thursday"
    );
  });

  it("strips the trailing [gmail-thread:...] marker from edited Gmail logs", () => {
    const note = [
      "SUMMARY: Sent intro to Marczyk",
      "DETAILS: Pitched seasonal flavors and offered tasting",
      "[gmail-thread:abc123xyz]",
    ].join("\n");

    const parsed = parseActivityNote(note);
    expect(parsed.details).toBe("Pitched seasonal flavors and offered tasting");
    expect(parsed.details).not.toContain("gmail-thread");
  });

  it("does not bleed gmail markers into OBJECTION or NEXT", () => {
    const noteObj = "OBJECTION: too pricey\n[gmail-thread:abc]";
    expect(parseActivityNote(noteObj).objection).toBe("too pricey");

    const noteNext = "NEXT: follow up Friday\n[gmail-message:xyz]";
    expect(parseActivityNote(noteNext).nextStep).toBe("follow up Friday");
  });

  it("auto-summarizes an unedited Gmail-imported sent log", () => {
    const note = [
      "[gmail-message:msg-1]",
      "[gmail-thread:thr-1]",
      "[Sent] Intro: Radical Sasquatch dumplings",
      "",
      "Hey Sandra, reaching out from Radical Sasquatch...",
    ].join("\n");

    const parsed = parseActivityNote(note);
    expect(parsed.summary).toBe('Sent email: "Intro: Radical Sasquatch dumplings"');
    expect(parsed.details).toContain("Hey Sandra");
  });

  it("auto-summarizes an unedited Gmail-imported received log", () => {
    const note = [
      "[gmail-message:msg-2]",
      "[gmail-thread:thr-2]",
      "[Received] Re: Tasting feedback",
      "From: Sandra Smith <sandra@tonys.com>",
      "",
      "Hi Jake, the team loved them — let's set up a re-order.",
    ].join("\n");

    const parsed = parseActivityNote(note);
    expect(parsed.summary).toBe('Reply received: "Re: Tasting feedback"');
    expect(parsed.details).toContain("the team loved them");
    expect(parsed.details).not.toContain("From:");
  });

  it("caps Gmail body at GMAIL_DETAILS_DISPLAY_CAP for legacy-thread logs", () => {
    const longBody = "x".repeat(1500);
    const note = [
      "[gmail-message:msg-3]",
      "[gmail-thread:thr-3]",
      "[Sent] Long thread",
      "",
      longBody,
    ].join("\n");

    const parsed = parseActivityNote(note);
    expect(parsed.details).not.toBeNull();
    expect(parsed.details!.length).toBeLessThanOrEqual(GMAIL_DETAILS_DISPLAY_CAP);
    expect(parsed.details!.endsWith("...")).toBe(true);
  });

  it("treats free-form notes containing 'NEXT:' mid-paragraph as plain (not structured)", () => {
    const note =
      "I asked her about pricing.\nShe brought up NEXT: steps for the meeting next week.";
    const parsed = parseActivityNote(note);
    // Should NOT be parsed as structured — stays as a plain note
    expect(parsed.nextStep).toBeNull();
    // Plain note has no blank line, so whole thing becomes summary
    expect(parsed.summary).toContain("I asked her about pricing");
  });

  it("splits a plain note at the first blank line into summary + details", () => {
    const note = "Quick visit at Lucky's, met the GM.\n\nHe was busy but engaged. Said send menu.";
    const parsed = parseActivityNote(note);
    expect(parsed.summary).toBe("Quick visit at Lucky's, met the GM.");
    expect(parsed.details).toBe("He was busy but engaged. Said send menu.");
  });

  it("keeps a single-paragraph plain note as summary only", () => {
    const note = "Dropped by, nobody available, came back to office.";
    const parsed = parseActivityNote(note);
    expect(parsed.summary).toBe("Dropped by, nobody available, came back to office.");
    expect(parsed.details).toBeNull();
  });

  it("round-trips through formatActivityNote → parseActivityNote", () => {
    const original = {
      summary: "Met with Sandra",
      details: "She liked the dumplings\nWants samples for the team",
      objection: "Price concern\nFreezer space tight",
      nextStep: "Send pricing\nFollow up Friday",
    };
    const formatted = formatActivityNote(original);
    const parsed = parseActivityNote(formatted);
    expect(parsed.summary).toBe(original.summary);
    expect(parsed.details).toBe(original.details);
    expect(parsed.objection).toBe(original.objection);
    expect(parsed.nextStep).toBe(original.nextStep);
  });
});
