const KEY = "hit_list_v3";

// Suppressions (Remove button) expire after 3 days so dismissed accounts
// eventually resurface in the auto-generated list without manual intervention.
const SUPPRESSION_TTL = 3 * 24 * 60 * 60 * 1000;

interface HitListState {
  // Suppressed auto-suggestions — stored with timestamp so they can expire.
  removedIds: Array<{ id: string; ts: number }>;
}

function loadState(): HitListState {
  if (typeof window === "undefined") return { removedIds: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { removedIds: [] };
    const parsed = JSON.parse(raw) as Partial<HitListState>;

    const rawRemoved = Array.isArray(parsed.removedIds) ? parsed.removedIds : [];
    const removedIds = rawRemoved
      .map((r) => (typeof r === "string" ? { id: r, ts: Date.now() } : r as { id: string; ts: number }))
      .filter((r) => Date.now() - r.ts < SUPPRESSION_TTL);

    return { removedIds };
  } catch {
    return { removedIds: [] };
  }
}

function saveState(state: HitListState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export function loadHitListSets(): { removedIds: Set<string>; manualIds: Set<string> } {
  const state = loadState();
  return {
    manualIds: new Set(),
    removedIds: new Set(state.removedIds.map((r) => r.id)),
  };
}

export function clearHitListSuppression(id: string) {
  const state = loadState();
  state.removedIds = state.removedIds.filter((r) => r.id !== id);
  saveState(state);
}

export function suppressHitListAccount(id: string) {
  const state = loadState();
  // Add/refresh suppression with current timestamp
  state.removedIds = state.removedIds.filter((r) => r.id !== id);
  state.removedIds.push({ id, ts: Date.now() });
  saveState(state);
}

export async function setHitListPinned(accountId: string, hitListPinned: boolean) {
  const response = await fetch("/api/accounts/hit-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, hitListPinned }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || "Failed to save hit list state.");
  }
}
