"use client";

import { SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className = "", ...props }: SelectProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm text-gray-300 mb-1">{label}</label>
      )}
      <select
        className={`w-full bg-rs-bg border border-rs-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-rs-gold ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
