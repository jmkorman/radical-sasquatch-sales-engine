// Single persistent key — no date suffix, never resets automatically.
const KEY = "hit_list_v2";

// Suppressions (Remove button) expire after 3 days so dismissed accounts
// eventually resurface in the auto-generated list without manual intervention.
const SUPPRESSION_TTL = 3 * 24 * 60 * 60 * 1000;

interface HitListState {
  // Manually added accounts — persist until explicitly removed.
  manualIds: string[];
  // Suppressed auto-suggestions — stored with timestamp so they can expire.
  removedIds: Array<{ id: string; ts: number }>;
}

function loadState(): HitListState {
  if (typeof window === "undefined") return { manualIds: [], removedIds: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { manualIds: [], removedIds: [] };
    const parsed = JSON.parse(raw) as Partial<HitListState>;

    // Migrate from old format (plain string arrays) to new format
    const manualIds: string[] = Array.isArray(parsed.manualIds)
      ? (parsed.manualIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];

    const rawRemoved = Array.isArray(parsed.removedIds) ? parsed.removedIds : [];
    const removedIds = rawRemoved
      .map((r) => (typeof r === "string" ? { id: r, ts: Date.now() } : r as { id: string; ts: number }))
      .filter((r) => Date.now() - r.ts < SUPPRESSION_TTL);

    return { manualIds, removedIds };
  } catch {
    return { manualIds: [], removedIds: [] };
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
    manualIds: new Set(state.manualIds),
    removedIds: new Set(state.removedIds.map((r) => r.id)),
  };
}

export function addToHitList(id: string) {
  const state = loadState();
  if (!state.manualIds.includes(id)) state.manualIds.push(id);
  state.removedIds = state.removedIds.filter((r) => r.id !== id);
  saveState(state);
}

export function removeFromHitList(id: string) {
  const state = loadState();
  // Remove from manual list
  state.manualIds = state.manualIds.filter((m) => m !== id);
  // Add/refresh suppression with current timestamp
  state.removedIds = state.removedIds.filter((r) => r.id !== id);
  state.removedIds.push({ id, ts: Date.now() });
  saveState(state);
}

export function isOnHitList(id: string): boolean {
  if (typeof window === "undefined") return false;
  const { manualIds } = loadState();
  return manualIds.includes(id);
}
