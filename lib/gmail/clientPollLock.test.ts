// Gmail poll lock — simulates two browser tabs sharing one localStorage,
// proving (a) only one poll fires at a time across tabs, (b) the throttle
// blocks a second non-forced poll, and (c) the 90s stale TTL lets another
// tab steal the lock if the original tab crashes without releasing it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeStorage {
  store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
}

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  // Two "tabs" share the SAME localStorage object — that's the whole point.
  vi.stubGlobal("window", { localStorage: storage });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

async function loadLock() {
  // Re-import so each test gets a fresh module bound to the stubbed window.
  vi.resetModules();
  return await import("@/lib/gmail/clientPollLock");
}

describe("Gmail poll lock — multi-tab", () => {
  it("first tab acquires, second tab is blocked while first is in-flight", async () => {
    const { tryAcquireGmailPollLock } = await loadLock();
    expect(tryAcquireGmailPollLock(true)).toBe(true);   // tab A
    expect(tryAcquireGmailPollLock(true)).toBe(false);  // tab B sees inflight
  });

  it("after release, the throttle still blocks a non-forced re-acquire", async () => {
    const { tryAcquireGmailPollLock, releaseGmailPollLock } = await loadLock();
    expect(tryAcquireGmailPollLock(true)).toBe(true);
    releaseGmailPollLock();
    // Without force=true, the 120s throttle prevents re-acquire immediately.
    expect(tryAcquireGmailPollLock(false)).toBe(false);
  });

  it("force=true bypasses the throttle for a manual poll", async () => {
    const { tryAcquireGmailPollLock, releaseGmailPollLock } = await loadLock();
    expect(tryAcquireGmailPollLock(true)).toBe(true);
    releaseGmailPollLock();
    expect(tryAcquireGmailPollLock(true)).toBe(true);
  });

  it("after the 120s throttle elapses, a non-forced acquire succeeds", async () => {
    const { tryAcquireGmailPollLock, releaseGmailPollLock } = await loadLock();
    expect(tryAcquireGmailPollLock(true)).toBe(true);
    releaseGmailPollLock();
    vi.advanceTimersByTime(120_001);
    expect(tryAcquireGmailPollLock(false)).toBe(true);
  });

  it("90s stale TTL lets a second tab steal the lock if the first never released", async () => {
    const { tryAcquireGmailPollLock } = await loadLock();
    expect(tryAcquireGmailPollLock(true)).toBe(true);   // tab A acquires
    // Tab A "crashes" — no release call. Still in-flight per state.
    expect(tryAcquireGmailPollLock(true)).toBe(false);  // tab B blocked

    vi.advanceTimersByTime(90_001);
    expect(tryAcquireGmailPollLock(true)).toBe(true);   // tab B steals stale
  });

  it("returns false when window is undefined (SSR safety)", async () => {
    vi.unstubAllGlobals();
    // Re-import without a window stub.
    vi.resetModules();
    const { tryAcquireGmailPollLock, releaseGmailPollLock } = await import(
      "@/lib/gmail/clientPollLock"
    );
    expect(tryAcquireGmailPollLock(true)).toBe(false);
    // Release should be a silent no-op, not throw.
    expect(() => releaseGmailPollLock()).not.toThrow();
  });
});
