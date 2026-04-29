"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSheetStore } from "@/stores/useSheetStore";
import { AnyAccount } from "@/types/accounts";

type NavItem = {
  kind: "nav";
  label: string;
  href: string;
  hint?: string;
  keywords: string[];
};

type AccountItem = {
  kind: "account";
  label: string;
  href: string;
  hint: string;
  keywords: string[];
};

type CommandItem = NavItem | AccountItem;

const NAV_ITEMS: NavItem[] = [
  { kind: "nav", label: "Dashboard", href: "/", hint: "Overview", keywords: ["home", "dashboard", "overview"] },
  { kind: "nav", label: "Pipeline", href: "/pipeline", hint: "Stage board", keywords: ["pipeline", "stage", "board", "kanban"] },
  { kind: "nav", label: "Active Accounts", href: "/active-accounts", hint: "Customer roster", keywords: ["active", "accounts", "roster", "customers"] },
  { kind: "nav", label: "Orders", href: "/orders", hint: "Production bridge", keywords: ["orders", "production", "fulfill"] },
  { kind: "nav", label: "Logs", href: "/logs", hint: "Activity timeline", keywords: ["logs", "activity", "timeline", "journal"] },
  { kind: "nav", label: "Settings", href: "/settings", hint: "Configure workspace", keywords: ["settings", "config", "preferences"] },
  { kind: "nav", label: "Follow-Ups Due", href: "/active-accounts?focus=overdue-followup", hint: "Overdue contacts", keywords: ["follow", "overdue", "due"] },
  { kind: "nav", label: "Today's Follow-Ups", href: "/active-accounts?focus=today-followup", hint: "On the docket", keywords: ["follow", "today"] },
];

function accountToItem(account: AnyAccount): AccountItem {
  const tab = account._tab;
  const keywords = [
    account.account,
    account.contactName ?? "",
    account.email ?? "",
    account.phone ?? "",
    tab,
    account.status ?? "",
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  return {
    kind: "account",
    label: account.account,
    hint: `${tab}${account.status ? ` · ${account.status}` : ""}`,
    href: `/accounts/${account._tabSlug}/${account._rowIndex}`,
    keywords,
  };
}

function scoreItem(item: CommandItem, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const label = item.label.toLowerCase();
  if (label === q) return 1000;
  if (label.startsWith(q)) return 500;
  if (label.includes(q)) return 300;
  if (item.keywords.some((kw) => kw.includes(q))) return 100;
  return -1;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const data = useSheetStore((state) => state.data);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Cmd+K / Ctrl+K toggle
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const allAccounts = useMemo(() => {
    if (!data) return [];
    return [
      ...data.restaurants,
      ...data.retail,
      ...data.catering,
      ...data.foodTruck,
      ...data.activeAccounts,
    ];
  }, [data]);

  const items = useMemo<CommandItem[]>(() => {
    if (!query.trim()) {
      return NAV_ITEMS;
    }
    const accountItems = allAccounts.map(accountToItem);
    const all: CommandItem[] = [...NAV_ITEMS, ...accountItems];
    const scored = all
      .map((item) => ({ item, score: scoreItem(item, query) }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);
    return scored.map(({ item }) => item);
  }, [allAccounts, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = items[activeIndex];
      if (target) navigate(target.href);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-[#090414]/75 px-4 py-20 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-rs-border/80 bg-[linear-gradient(180deg,rgba(26,15,69,0.98),rgba(16,7,38,0.98))] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-rs-border/60 px-4 py-3">
          <span className="text-rs-cyan">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to page or account…"
            className="w-full bg-transparent text-sm text-rs-cream outline-none placeholder:text-[#8c7fbd]"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-[#af9fe6] hover:text-rs-cream"
            aria-label="Close"
          >
            ESC
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-[#8c7fbd]">No matches.</div>
          ) : (
            items.map((item, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={`${item.kind}-${item.href}-${item.label}`}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => navigate(item.href)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                    active ? "bg-rs-cyan/15 text-rs-cyan" : "text-rs-cream hover:bg-white/10"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{item.label}</div>
                    {item.hint && (
                      <div className={`truncate text-[11px] ${active ? "text-rs-cyan/80" : "text-[#8c7fbd]"}`}>
                        {item.hint}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#8c7fbd]">
                    {item.kind === "account" ? "Account" : "Page"}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t border-rs-border/60 px-4 py-2 text-[10px] uppercase tracking-wider text-[#8c7fbd]">
          <span>↑↓ Navigate · ↵ Open</span>
          <span>⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}
