export interface SheetUpdatePayload {
  tab: string;
  rowIndex: number;
  updates: { columnIndex: number; value: string }[];
}

export type SyncStatus = "idle" | "syncing" | "error";
