"use client";

import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}

const variants = {
  primary: "bg-[linear-gradient(135deg,#64f5ea,#34ddd2)] text-[#12072f] hover:brightness-105 font-semibold shadow-[0_10px_24px_rgba(100,245,234,0.24)]",
  secondary: "border border-rs-border bg-white/5 text-rs-cream hover:border-rs-gold hover:text-rs-gold",
  ghost: "text-rs-gold hover:text-rs-cream hover:bg-white/5",
};

const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
