export function daysSince(dateStr: string): number {
  if (!dateStr) return Infinity;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return Infinity;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function isOverdue(dateStr: string): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  return date.getTime() < new Date().setHours(0, 0, 0, 0);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
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
