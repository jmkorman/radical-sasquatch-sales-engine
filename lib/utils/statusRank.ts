// Linear pipeline progression. Auto-status updates from email activity should
// only ADVANCE the account along this ladder, never demote.
//
// "Backburner" and "Not a Fit" are intentionally NOT in the linear progression
// — those are user-driven moves and shouldn't be touched by automation.

const PIPELINE_RANK: Record<string, number> = {
  "": 0,
  "Identified": 1,
  "Researched": 1,
  "Reached Out": 2,
  "Contacted": 2,
  "Connected": 3,
  "Following Up": 3,
  "Sample Sent": 4,
  "Tasting Complete": 5,
  "Decision Pending": 6,
  "Active Account": 7,
  "Closed - Won": 7,
};

/** Higher number = further along the funnel. Unknown status returns 0. */
export function statusRank(status: string | null | undefined): number {
  if (!status) return 0;
  return PIPELINE_RANK[status] ?? 0;
}

/**
 * Returns true if `proposed` is strictly more senior than `current` in the
 * pipeline. Use this before applying an auto-suggested status change so a
 * Sample Sent account doesn't get demoted to Reached Out by an outbound poll.
 */
export function isPromotion(current: string | null | undefined, proposed: string | null | undefined): boolean {
  if (!proposed) return false;
  return statusRank(proposed) > statusRank(current);
}
