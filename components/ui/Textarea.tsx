"use client";

import { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className = "", ...props }: TextareaProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm text-gray-300 mb-1">{label}</label>
      )}
      <textarea
        className={`w-full bg-rs-bg border border-rs-border rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-rs-gold resize-y ${className}`}
        rows={3}
        {...props}
      />
    </div>
  );
}
