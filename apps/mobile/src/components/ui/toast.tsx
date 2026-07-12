import { Feather } from "@expo/vector-icons";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * Toast (ADR-UX1 §component-kit, mobile). One queue; `useToast().show(...)` from
 * any mutation. Auto-dismiss 4s. Rendered above the app via a root provider.
 */
type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<{ show: (kind: ToastKind, message: string) => void } | null>(
  null,
);

const ICON: Record<ToastKind, keyof typeof Feather.glyphMap> = {
  success: "check-circle",
  error: "x-circle",
  info: "info",
};
const COLOR: Record<ToastKind, string> = { success: "#15803D", error: "#B91C1C", info: "#1D4ED8" };
const BORDER: Record<ToastKind, string> = {
  success: "border-success-200",
  error: "border-danger-200",
  info: "border-info-200",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toasts.length > 0 ? (
        <View className="absolute inset-x-4 bottom-10 gap-2" pointerEvents="none">
          {toasts.map((t) => (
            <View
              key={t.id}
              className={`flex-row items-center gap-2 rounded-lg border bg-card p-3 shadow-lg ${BORDER[t.kind]}`}
            >
              <Feather name={ICON[t.kind]} size={16} color={COLOR[t.kind]} />
              <Text className="font-sans flex-1 text-sm text-neutral-800">{t.message}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
