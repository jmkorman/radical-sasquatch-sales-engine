"use client";

import { useState } from "react";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
}

/** Standalone calendar grid. Wrap with `<DateField>` for label + popover behavior. */
export function DatePicker({ value, onChange }: DatePickerProps) {
  const today = new Date();
  const initial = value ? new Date(`${value}T00:00:00`) : today;
  const [month, setMonth] = useState(initial.getMonth());
  const [year, setYear] = useState(initial.getFullYear());

  const goToPreviousMonth = () => {
    setMonth((current) => {
      if (current > 0) return current - 1;
      setYear((y) => y - 1);
      return 11;
    });
  };

  const goToNextMonth = () => {
    setMonth((current) => {
      if (current < 11) return current + 1;
      setYear((y) => y + 1);
      return 0;
    });
  };

  const daysInMonth = (m: number, y: number) => new Date(y, m + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const days = Array.from({ length: daysInMonth(month, year) }, (_, i) => i + 1);
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDay).fill(null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push([...week, ...Array(7 - week.length).fill(null)]);

  const selected = value ? new Date(`${value}T00:00:00`) : null;

  return (
    <div className="mt-2 w-full rounded-lg border border-rs-border bg-rs-surface p-3 shadow-lg">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goToPreviousMonth}
          className="h-8 w-8 rounded-md border border-rs-border text-sm text-gray-300 hover:border-rs-gold hover:text-white"
          aria-label="Previous month"
        >
          ←
        </button>
        <div className="text-sm font-semibold text-gray-200">
          {MONTH_NAMES[month]} {year}
        </div>
        <button
          type="button"
          onClick={goToNextMonth}
          className="h-8 w-8 rounded-md border border-rs-border text-sm text-gray-300 hover:border-rs-gold hover:text-white"
          aria-label="Next month"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="h-6 w-6 text-center text-gray-500">
            {d}
          </div>
        ))}
        {weeks.flatMap((week, i) =>
          week.map((day, j) => (
            <button
              type="button"
              key={`${i}-${j}`}
              onClick={() => {
                if (!day) return;
                const d = String(day).padStart(2, "0");
                const m = String(month + 1).padStart(2, "0");
                onChange(`${year}-${m}-${d}`);
              }}
              disabled={day === null}
              className={`h-7 w-7 rounded text-xs ${
                day === null
                  ? "cursor-default"
                  : selected &&
                    selected.getDate() === day &&
                    selected.getMonth() === month &&
                    selected.getFullYear() === year
                    ? "bg-rs-gold text-rs-bg"
                    : "text-gray-300 hover:bg-rs-border"
              }`}
            >
              {day ?? ""}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

interface DateFieldProps {
  label?: string;
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  optional?: boolean;
}

/** Click-to-open calendar input. Mirrors the pattern used in LogOutreachModal. */
export function DateField({ label, value, onChange, placeholder, optional }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {label && (
        <label className="mb-1 block text-sm text-gray-300">
          {label}
          {optional && <span className="ml-1 text-xs text-[#af9fe6]">(optional)</span>}
        </label>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-lg border border-rs-border bg-rs-bg px-3 py-2 text-left text-sm text-white hover:border-rs-gold focus:outline-none"
        aria-expanded={open}
      >
        {value || placeholder || "Click to select date"}
      </button>
      {open && (
        <DatePicker
          value={value}
          onChange={(date) => {
            onChange(date);
            setOpen(false);
          }}
        />
      )}
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
          className="mt-1 text-xs text-[#af9fe6] hover:text-rs-gold"
        >
          Clear date
        </button>
      )}
    </div>
  );
}
