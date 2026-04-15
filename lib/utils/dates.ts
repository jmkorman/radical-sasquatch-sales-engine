export function parseAppDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  const native = new Date(trimmed);
  if (!isNaN(native.getTime())) return native;

  const monthDayMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (monthDayMatch) {
    const now = new Date();
    const month = parseInt(monthDayMatch[1], 10) - 1;
    const day = parseInt(monthDayMatch[2], 10);
    let year = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : now.getFullYear();

    if (year < 100) year += 2000;

    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

export function dateToTimestamp(dateStr: string): number {
  const parsed = parseAppDate(dateStr);
  return parsed ? parsed.getTime() : 0;
}

export function daysSince(dateStr: string): number {
  if (!dateStr) return Infinity;
  const date = parseAppDate(dateStr);
  if (!date) return Infinity;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function isOverdue(dateStr: string): boolean {
  if (!dateStr) return false;
  const date = parseAppDate(dateStr);
  if (!date) return false;
  return date.getTime() < new Date().setHours(0, 0, 0, 0);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? parseAppDate(date) : date;
  if (!d || isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? parseAppDate(date) : date;
  if (!d || isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// Format as "M/DD" for Google Sheets (e.g., "4/15")
export function formatDateForSheet(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const month = d.getMonth() + 1;
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

// Parse dates from free-text like "Follow up 4/18" or "Call 04/20/2026"
const DATE_PATTERNS = [
  /(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // MM/DD/YYYY
  /(\d{1,2})\/(\d{1,2})\/(\d{2})/,  // MM/DD/YY
  /(\d{1,2})\/(\d{1,2})/,            // MM/DD (assumes current year)
];

export function parseDateFromText(text: string): Date | null {
  if (!text) return null;
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const month = parseInt(match[1], 10) - 1;
      const day = parseInt(match[2], 10);
      let year = match[3]
        ? parseInt(match[3], 10)
        : new Date().getFullYear();
      if (year < 100) year += 2000;
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    }
  }
  return null;
}
