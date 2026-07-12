"use client";

import { cn } from "@repo/ui";
import type { ReactNode } from "react";

/**
 * Layout primitives (ADR-UX1 §component-kit): PageHeader, Tabs, Avatar.
 */

export function PageHeader({
  title,
  breadcrumb,
  action,
}: {
  title: string;
  breadcrumb?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 pb-4">
      <div className="flex flex-col gap-1">
        {breadcrumb && <div className="text-caption text-neutral-500">{breadcrumb}</div>}
        <h1 className="text-display font-semibold text-neutral-900">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export interface Tab {
  key: string;
  label: string;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly Tab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-neutral-200">
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={cn(
              "cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-fast",
              selected
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-neutral-500 hover:text-neutral-800",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// Deterministic accent per person, from the domain-accent palette.
const AVATAR_BG = [
  "bg-attendance",
  "bg-exams",
  "bg-homework",
  "bg-fees",
  "bg-calendar",
  "bg-messages",
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toUpperCase();
}

function hashIndex(name: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const dim = { sm: "size-8 text-caption", md: "size-10 text-sm", lg: "size-12 text-body" }[size];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        AVATAR_BG[hashIndex(name, AVATAR_BG.length)],
        dim,
      )}
    >
      {initials(name)}
    </span>
  );
}
