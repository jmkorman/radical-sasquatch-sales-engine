"use client";

import { STATUS_COLORS } from "@/lib/utils/constants";

export function Badge({ status }: { status: string }) {
  const colorClass = STATUS_COLORS[status] || "bg-gray-600";
  const label = status || "No Status";

  return (
    <span
      className={`${colorClass} text-white text-xs font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap`}
    >
      {label}
    </span>
  );
}
