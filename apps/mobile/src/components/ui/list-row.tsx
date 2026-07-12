import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

/**
 * Avatar (ADR-UX1, mobile) — initials with a deterministic accent background.
 */
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
  const dim = { sm: "size-8", md: "size-10", lg: "size-12" }[size];
  const text = { sm: "text-caption", md: "text-sm", lg: "text-body" }[size];
  return (
    <View
      className={`items-center justify-center rounded-full ${AVATAR_BG[hashIndex(name, 6)]} ${dim}`}
    >
      <Text className={`font-semibold text-white ${text}`}>{initials(name)}</Text>
    </View>
  );
}

/**
 * ListRow — avatar/icon slot, title, secondary line, trailing chip/chevron.
 * ≥44pt, pressed feedback. The mobile "table row".
 */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 rounded-card border border-neutral-200 bg-card px-4 py-3 active:opacity-70"
    >
      {leading}
      <View className="flex-1">
        <Text className="font-sans text-body font-medium text-neutral-900">{title}</Text>
        {subtitle ? <Text className="font-sans text-sm text-neutral-500">{subtitle}</Text> : null}
      </View>
      {trailing ?? (onPress ? <Feather name="chevron-right" size={20} color="#A8A29E" /> : null)}
    </Pressable>
  );
}
