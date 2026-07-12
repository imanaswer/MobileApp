import type { ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * Card (ADR-UX1 §3, mobile) — white surface, subtle border, radius 12. Optional
 * domain `accent` renders a left border so modules scan fast.
 */
type Accent = "attendance" | "exams" | "homework" | "fees" | "calendar" | "messages";

const ACCENT: Record<Accent, string> = {
  attendance: "border-l-4 border-l-attendance",
  exams: "border-l-4 border-l-exams",
  homework: "border-l-4 border-l-homework",
  fees: "border-l-4 border-l-fees",
  calendar: "border-l-4 border-l-calendar",
  messages: "border-l-4 border-l-messages",
};

export function Card({
  children,
  accent,
  className,
}: {
  children: ReactNode;
  accent?: Accent;
  className?: string;
}) {
  return (
    <View
      className={`rounded-card border border-neutral-200 bg-card p-4 ${accent ? ACCENT[accent] : ""} ${
        className ?? ""
      }`}
    >
      {children}
    </View>
  );
}

export function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: Accent;
}) {
  return (
    <Card accent={accent} className="gap-1">
      <Text className="font-sans text-sm text-neutral-500">{label}</Text>
      <Text className="font-sans text-display font-semibold text-neutral-900">{value}</Text>
    </Card>
  );
}
