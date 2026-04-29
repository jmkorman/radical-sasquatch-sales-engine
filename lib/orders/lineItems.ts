// Line items get encoded into the existing `details` text column with a
// JSON header. This avoids a schema migration: the marker line is invisible
// to anyone reading the raw `details` column, and `parseOrderDetails` peels
// it back out for the UI. Free-form notes after the marker stay as plain text.

const LINE_ITEMS_MARKER = "LINE_ITEMS:";

export interface OrderLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface ParsedOrderDetails {
  lineItems: OrderLineItem[];
  freeText: string;
}

export function parseOrderDetails(details: string | null | undefined): ParsedOrderDetails {
  const raw = (details ?? "").trim();
  if (!raw) return { lineItems: [], freeText: "" };

  const lines = raw.split("\n");
  const markerIdx = lines.findIndex((line) => line.startsWith(LINE_ITEMS_MARKER));
  if (markerIdx === -1) return { lineItems: [], freeText: raw };

  const json = lines[markerIdx].slice(LINE_ITEMS_MARKER.length).trim();
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(json);
  } catch {
    return { lineItems: [], freeText: raw };
  }

  const lineItems: OrderLineItem[] = Array.isArray(parsed)
    ? parsed
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .map((item) => ({
          name: typeof item.name === "string" ? item.name : "",
          quantity: typeof item.quantity === "number" ? item.quantity : Number(item.quantity) || 0,
          unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : Number(item.unitPrice) || 0,
        }))
    : [];

  // Anything before/after the marker line is free text
  const freeText = [...lines.slice(0, markerIdx), ...lines.slice(markerIdx + 1)]
    .join("\n")
    .trim();

  return { lineItems, freeText };
}

export function encodeOrderDetails(lineItems: OrderLineItem[], freeText: string): string {
  const cleanItems = lineItems
    .filter((item) => item.name.trim() || item.quantity > 0 || item.unitPrice > 0)
    .map((item) => ({
      name: item.name.trim(),
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
    }));

  const parts: string[] = [];
  if (cleanItems.length) {
    parts.push(`${LINE_ITEMS_MARKER}${JSON.stringify(cleanItems)}`);
  }
  if (freeText.trim()) parts.push(freeText.trim());
  return parts.join("\n");
}

export function lineItemsTotal(items: OrderLineItem[]): number {
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
}

/** Human-readable summary, e.g. "4 cases Pork Dumplings · 2 cases Veggie Dumplings" */
export function summarizeLineItems(items: OrderLineItem[], maxItems = 3): string {
  const visible = items.slice(0, maxItems);
  const summary = visible
    .map((item) => `${item.quantity}× ${item.name || "Item"}`)
    .join(" · ");
  const more = items.length - visible.length;
  return more > 0 ? `${summary} · +${more} more` : summary;
}
