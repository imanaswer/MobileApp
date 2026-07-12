import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

/**
 * ScreenScaffold (ADR-UX1, mobile) — upgraded shell: back, title, optional right
 * action, and built-in pull-to-refresh. Neutral-50 app background, white header.
 */
export function ScreenScaffold({
  title,
  action,
  onRefresh,
  refreshing,
  children,
}: {
  title: string;
  action?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <View className="flex-1 bg-neutral-50">
      <View className="flex-row items-center gap-2 border-b border-neutral-200 bg-white px-3 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          className="size-11 items-center justify-center rounded-md active:opacity-70"
        >
          <Feather name="chevron-left" size={24} color="#292524" />
        </Pressable>
        <Text className="font-sans flex-1 text-title text-neutral-900">{title}</Text>
        {action}
      </View>
      <ScrollView
        contentContainerClassName="p-4 gap-3"
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** SegmentedControl — mutually-exclusive options (e.g. Staff / Parent tabs). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View className="flex-row rounded-md border border-neutral-300 bg-neutral-100 p-1">
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.key)}
            className={`min-h-9 flex-1 items-center justify-center rounded ${active ? "bg-white" : ""}`}
          >
            <Text
              className={`text-sm font-medium ${active ? "text-primary-700" : "text-neutral-500"}`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
