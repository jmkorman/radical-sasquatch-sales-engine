// Gmail poll lock — shared across every tab in the same browser session.
//
// Previously this was a module-level boolean, which meant the lock only
// existed inside one JavaScript module instance — i.e. one browser tab.
// Two tabs open against the same app each had their own `inFlight` and
// their own `lastAt`, so each tab polled Gmail every 60s independently,
// doubling API calls and exposing a race that could insert duplicate
// activity_log rows for the same message.
//
// The fix: persist the lock state in localStorage (per-origin, shared
// across all tabs of the same session and surviving reloads). A stale-
// inflight TTL guards against a crashed tab that acquires the lock and
// never releases it.

const STORAGE_KEY = "rs-gmail-poll-lock";
const THROTTLE_MS = 120_000;
const STALE_INFLIGHT_MS = 90_000;

type LockState = { inFlight: boolean; startedAt: number; lastAt: number };

const EMPTY: LockState = { inFlight: false, startedAt: 0, lastAt: 0 };

function readLock(): LockState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<LockState>;
    return {
      inFlight: Boolean(parsed.inFlight),
      startedAt: Number(parsed.startedAt) || 0,
      lastAt: Number(parsed.lastAt) || 0,
    };
  } catch {
    return EMPTY;
  }
}

function writeLock(state: LockState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota / privacy mode — silently degrade. Worst case we revert to
    // the old per-tab behavior, which is what we had before.
  }
}

/**
 * Try to acquire the Gmail poll lock for this whole browser session.
 * @param force - skip the 120s throttle (for manual user-triggered polls)
 * Returns true if the lock was acquired (caller should proceed with the poll).
 */
export function tryAcquireGmailPollLock(force = false): boolean {
  if (typeof window === "undefined") return false;
  const state = readLock();
  const now = Date.now();
  const inFlightAlive = state.inFlight && now - state.startedAt < STALE_INFLIGHT_MS;
  if (inFlightAlive) return false;
  if (!force && now - state.lastAt < THROTTLE_MS) return false;
  writeLock({ inFlight: true, startedAt: now, lastAt: now });
  return true;
}

export function releaseGmailPollLock(): void {
  if (typeof window === "undefined") return;
  const state = readLock();
  writeLock({ ...state, inFlight: false });
}
