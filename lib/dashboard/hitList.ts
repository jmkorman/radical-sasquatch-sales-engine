const getKey = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `hit_list_${d.getFullYear()}-${m}-${day}`;
};

interface HitListState {
  removedIds: string[];
  manualIds: string[];
}

function loadState(): HitListState {
  if (typeof window === "undefined") return { removedIds: [], manualIds: [] };
  try {
    const raw = localStorage.getItem(getKey());
    if (!raw) return { removedIds: [], manualIds: [] };
    return JSON.parse(raw) as HitListState;
  } catch {
    return { removedIds: [], manualIds: [] };
  }
}

function saveState(state: HitListState) {
  try {
    localStorage.setItem(getKey(), JSON.stringify(state));
  } catch {}
}

export function loadHitListSets(): { removedIds: Set<string>; manualIds: Set<string> } {
  const { removedIds, manualIds } = loadState();
  return { removedIds: new Set(removedIds), manualIds: new Set(manualIds) };
}

export function addToHitList(id: string) {
  const state = loadState();
  if (!state.manualIds.includes(id)) state.manualIds.push(id);
  state.removedIds = state.removedIds.filter((r) => r !== id);
  saveState(state);
}

export function removeFromHitList(id: string) {
  const state = loadState();
  if (!state.removedIds.includes(id)) state.removedIds.push(id);
  state.manualIds = state.manualIds.filter((m) => m !== id);
  saveState(state);
}

export function isOnHitList(id: string): boolean {
  if (typeof window === "undefined") return false;
  const { manualIds } = loadState();
  return manualIds.includes(id);
}
