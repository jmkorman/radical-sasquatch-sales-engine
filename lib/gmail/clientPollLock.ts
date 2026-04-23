// Shared client-side lock prevents concurrent Gmail polls from the same browser session.
// Both the layout background poll and the manual "Refresh Gmail" button import this.

let inFlight = false;
let lastAt = 0;
const THROTTLE_MS = 120_000;

/**
 * Try to acquire the Gmail poll lock.
 * @param force - skip the 120s throttle (for manual user-triggered polls)
 * Returns true if the lock was acquired (caller should proceed with the poll).
 */
export function tryAcquireGmailPollLock(force = false): boolean {
  if (inFlight) return false;
  if (!force && Date.now() - lastAt < THROTTLE_MS) return false;
  inFlight = true;
  lastAt = Date.now();
  return true;
}

export function releaseGmailPollLock(): void {
  inFlight = false;
}
