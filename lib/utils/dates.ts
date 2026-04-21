export function parseAppDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Handle YYYY-MM-DD as local time (new Date("2026-04-22") parses as UTC midnight
  // which shifts to the prior day in timezones west of UTC)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

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

  const namedMonthMatch = trimmed.match(
    /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(\d{2,4}))?$/i
  );
  if (namedMonthMatch) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.findIndex((m) => namedMonthMatch[1].toLowerCase().startsWith(m));
    const day = parseInt(namedMonthMatch[2], 10);
    let year = namedMonthMatch[3] ? parseInt(namedMonthMatch[3], 10) : new Date().getFullYear();

    if (year < 100) year += 2000;

    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const native = new Date(trimmed);
  if (!isNaN(native.getTime())) return native;

  return null;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function calendarDaysBetween(from: Date, to = new Date()): number {
  const fromDay = startOfLocalDay(from);
  const toDay = startOfLocalDay(to);
  return Math.floor((toDay.getTime() - fromDay.getTime()) / (1000 * 60 * 60 * 24));
}

export function dateToTimestamp(dateStr: string): number {
  const parsed = parseAppDate(dateStr);
  return parsed ? parsed.getTime() : 0;
}

export function daysSince(dateStr: string): number {
  if (!dateStr) return Infinity;
  const date = parseAppDate(dateStr);
  if (!date) return Infinity;
  return calendarDaysBetween(date);
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
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// Format as "M/DD" for Google Sheets (e.g., "4/15")
export function formatDateForSheet(date: Date | string): string {
  const d = typeof date === "string" ? parseAppDate(date) : date;
  if (!d || isNaN(d.getTime())) return "";
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

export function getContactAgeTone(dateStr: string): "fresh" | "week" | "twoWeeks" | "month" | "unknown" {
  const days = daysSince(dateStr);
  if (!Number.isFinite(days)) return "unknown";
  if (days >= 30) return "month";
  if (days >= 14) return "twoWeeks";
  if (days >= 7) return "week";
  return "fresh";
}

export function getContactAgeClass(dateStr: string): string {
  const tone = getContactAgeTone(dateStr);
  if (tone === "month") return "bg-red-500/10 text-red-200 border border-red-400/20";
  if (tone === "twoWeeks") return "bg-orange-500/10 text-orange-200 border border-orange-400/20";
  if (tone === "week") return "bg-yellow-500/10 text-yellow-100 border border-yellow-300/20";
  return "";
}
