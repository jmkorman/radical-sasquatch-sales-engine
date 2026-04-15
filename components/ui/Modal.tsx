"use client";

import { useEffect, useRef } from "react";

interface ModalProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export function Modal({ title, children, onClose }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#090414]/75 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-rs-border/80 bg-[linear-gradient(180deg,rgba(26,15,69,0.98),rgba(16,7,38,0.98))] shadow-[0_24px_60px_rgba(9,4,26,0.45)]">
        <div className="flex items-center justify-between border-b border-rs-border/80 p-4">
          <h2 className="text-lg font-semibold text-rs-cream">{title}</h2>
          <button
            onClick={onClose}
            className="text-[#d8ccfb] hover:text-rs-gold text-xl leading-none"
          >
            x
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
