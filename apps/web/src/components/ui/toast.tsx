"use client";

import { cn } from "@repo/ui";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

/**
 * Toast system (ADR-UX1 §component-kit / §8). One queue, one provider at the app
 * root; `useToast().show(...)` from any mutation. Auto-dismiss 4s; `aria-live`
 * polite so screen readers announce without stealing focus.
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

const ICON = { success: CheckCircle2, error: XCircle, info: Info } as const;
const STYLE: Record<ToastKind, string> = {
  success: "border-success-200 text-success-700",
  error: "border-danger-200 text-danger-700",
  info: "border-info-200 text-info-700",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex items-start gap-2 rounded-lg border bg-card p-3 text-sm shadow-lg",
                STYLE[t.kind],
              )}
            >
              <Icon aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
              <p className="flex-1 text-neutral-800">{t.message}</p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="cursor-pointer text-neutral-400 hover:text-neutral-600"
              >
                <X aria-hidden strokeWidth={1.75} className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
