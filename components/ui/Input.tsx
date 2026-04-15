"use client";

import { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className = "", ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm text-gray-300 mb-1">{label}</label>
      )}
      <input
        className={`w-full bg-rs-bg border border-rs-border rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-rs-gold ${className}`}
        {...props}
      />
    </div>
  );
}
