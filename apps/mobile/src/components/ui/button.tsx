import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text } from "react-native";

/**
 * Button (ADR-UX1 §component-kit, mobile). Variants + sizes from tokens; loading
 * shows a spinner and disables; press feedback = opacity 0.7; ≥44pt tap target.
 * Takes a `label` (RN needs Text) + optional Feather icon.
 */
type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "md" | "lg";

const VARIANT: Record<Variant, { box: string; text: string; spinner: string }> = {
  primary: { box: "bg-primary-600 active:opacity-70", text: "text-white", spinner: "#FFFFFF" },
  secondary: {
    box: "border border-neutral-300 bg-white active:opacity-70",
    text: "text-neutral-800",
    spinner: "#292524",
  },
  ghost: { box: "active:opacity-70", text: "text-primary-700", spinner: "#1D4ED8" },
  destructive: { box: "bg-danger-600 active:opacity-70", text: "text-white", spinner: "#FFFFFF" },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
}) {
  const v = VARIANT[variant];
  const isOff = disabled || loading;
  const height = size === "lg" ? "min-h-12" : "min-h-11";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isOff }}
      disabled={isOff}
      onPress={onPress}
      className={`${height} flex-row items-center justify-center gap-2 rounded-md px-4 ${v.box} ${
        isOff ? "opacity-50" : ""
      }`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.spinner} />
      ) : (
        icon && <Feather name={icon} size={16} color={v.spinner} />
      )}
      <Text className={`font-sans text-body font-medium ${v.text}`}>{label}</Text>
    </Pressable>
  );
}
