"use client";

import { cn } from "@repo/ui";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Card (ADR-UX1 §3) — white surface on the neutral-50 app background, subtle
 * border + shadow, radius 12. `interactive` adds hover/press affordance; the
 * optional `accent` domain colour renders as a left border so modules scan fast.
 */
type Accent = "attendance" | "exams" | "homework" | "fees" | "calendar" | "messages";

const ACCENT_BORDER: Record<Accent, string> = {
  attendance: "border-l-4 border-l-attendance",
  exams: "border-l-4 border-l-exams",
  homework: "border-l-4 border-l-homework",
  fees: "border-l-4 border-l-fees",
  calendar: "border-l-4 border-l-calendar",
  messages: "border-l-4 border-l-messages",
};

export function Card({
  children,
  className,
  interactive,
  accent,
  ...props
}: {
  children: ReactNode;
  className?: string | undefined;
  interactive?: boolean | undefined;
  accent?: Accent | undefined;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-card border border-neutral-200 bg-card p-5 shadow-sm",
        accent && ACCENT_BORDER[accent],
        interactive &&
          "cursor-pointer transition-shadow duration-fast hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Stat card — label + value (+ optional delta + icon). Values use tabular-nums. */
export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  delta?: { value: string; positive?: boolean } | undefined;
  icon?: LucideIcon | undefined;
  accent?: Accent | undefined;
}) {
  return (
    <Card accent={accent} className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{label}</p>
        {Icon && <Icon aria-hidden strokeWidth={1.75} className="size-5 text-neutral-400" />}
      </div>
      <p className="text-display font-semibold tabular-nums text-neutral-900">{value}</p>
      {delta && (
        <p
          className={cn(
            "text-caption font-medium",
            delta.positive ? "text-success-700" : "text-danger-600",
          )}
        >
          {delta.value}
        </p>
      )}
    </Card>
  );
}
