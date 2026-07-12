import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { Button } from "./button";

/**
 * Status + feedback primitives (ADR-UX1, mobile). StatusChip renders every enum
 * through one tone map — color + Title-Case label, never color alone. The
 * `statusTone`/`titleCase` helpers mirror the web kit (pure; a shared util is a
 * future cleanup).
 */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const CHIP: Record<Tone, string> = {
  success: "bg-success-50 border-success-200",
  warning: "bg-warning-50 border-warning-200",
  danger: "bg-danger-50 border-danger-200",
  info: "bg-info-50 border-info-200",
  neutral: "bg-neutral-100 border-neutral-200",
};
const CHIP_TEXT: Record<Tone, string> = {
  success: "text-success-700",
  warning: "text-warning-700",
  danger: "text-danger-700",
  info: "text-info-700",
  neutral: "text-neutral-700",
};

const STATUS_TONE: Record<string, Tone> = {
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warning",
  LEAVE: "info",
  HALF_DAY: "warning",
  PUBLISHED: "success",
  APPROVED: "success",
  LOCKED: "success",
  DRAFT: "info",
  SUBMITTED: "info",
  GENERATED: "info",
  UPLOADED: "info",
  OPEN: "info",
  PENDING: "warning",
  IN_PROGRESS: "warning",
  RETURNED: "warning",
  PARTIAL: "warning",
  CLOSED: "neutral",
  ARCHIVED: "neutral",
  SUPERSEDED: "neutral",
  CANCELLED: "neutral",
  REVOKED: "danger",
  PAID: "success",
  ISSUED: "info",
  OVERDUE: "danger",
  RESOLVED: "success",
  REJECTED: "danger",
};

export function statusTone(status: string): Tone {
  return STATUS_TONE[status.toUpperCase()] ?? "neutral";
}
export function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function StatusChip({
  status,
  tone,
  label,
}: {
  status?: string;
  tone?: Tone;
  label?: string;
}) {
  const t = tone ?? (status ? statusTone(status) : "neutral");
  const text = label ?? (status ? titleCase(status) : "");
  return (
    <View className={`self-start rounded-full border px-2.5 py-0.5 ${CHIP[t]}`}>
      <Text className={`text-caption font-medium ${CHIP_TEXT[t]}`}>{text}</Text>
    </View>
  );
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <View className={`self-start rounded-full border px-1.5 ${CHIP[tone]}`}>
      <Text className={`text-caption font-semibold ${CHIP_TEXT[tone]}`}>{label}</Text>
    </View>
  );
}

export function Banner({
  tone = "warning",
  icon = "alert-triangle",
  children,
}: {
  tone?: Tone;
  icon?: keyof typeof Feather.glyphMap;
  children: ReactNode;
}) {
  return (
    <View className={`flex-row items-start gap-2 rounded-lg border p-3 ${CHIP[tone]}`}>
      <Feather name={icon} size={16} color="#B45309" />
      <View className="flex-1">
        <Text className={`text-sm ${CHIP_TEXT[tone]}`}>{children}</Text>
      </View>
    </View>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  message,
  action,
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View className="items-center justify-center gap-3 px-6 py-12">
      <View className="size-12 items-center justify-center rounded-full bg-neutral-100">
        <Feather name={icon} size={24} color="#A8A29E" />
      </View>
      <Text className="font-sans text-title text-neutral-800">{title}</Text>
      {message ? (
        <Text className="font-sans text-center text-sm text-neutral-500">{message}</Text>
      ) : null}
      {action}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View className="items-center justify-center gap-3 px-6 py-12">
      <View className="size-12 items-center justify-center rounded-full bg-danger-50">
        <Feather name="alert-triangle" size={24} color="#DC2626" />
      </View>
      <Text className="font-sans text-center text-sm text-neutral-600">
        {message ?? "Something went wrong. You may not have access, or the server is unreachable."}
      </Text>
      {onRetry ? (
        <Button label="Retry" variant="secondary" icon="refresh-cw" onPress={onRetry} />
      ) : null}
    </View>
  );
}

/** Skeleton — a neutral block mirroring the final layout (shimmer deferred). */
export function Skeleton({ className }: { className?: string }) {
  return <View className={`rounded-md bg-neutral-200 ${className ?? ""}`} />;
}
