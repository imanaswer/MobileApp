"use client";

import { cn } from "@repo/ui";
import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "./button";

/**
 * Dialog (ADR-UX1 §3, §navigation) — scrim + Esc/backdrop close, initial focus
 * inside, radius 16. Replaces the legacy `Modal`. Scrim is neutral-900/50 so
 * foreground stays legible.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  size = "md",
}: {
  title: string;
  description?: string | undefined;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | undefined;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const width = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("w-full rounded-xl border border-neutral-200 bg-card p-6 shadow-lg", width)}
      >
        <h2 className="text-title text-neutral-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * Confirm dialog for destructive actions — repeats the object's NAME so a
 * mistaken click is caught (ADR-UX1 §component-kit).
 */
export function ConfirmDialog({
  title,
  objectName,
  message,
  confirmLabel = "Delete",
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  objectName?: string | undefined;
  message?: string | undefined;
  confirmLabel?: string | undefined;
  busy?: boolean | undefined;
  error?: string | null | undefined;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog title={title} onClose={onCancel} size="sm">
      <p className="text-sm text-neutral-600">
        {message ?? "This action can’t be undone."}
        {objectName && (
          <>
            {" "}
            <span className="font-semibold text-neutral-900">{objectName}</span>
          </>
        )}
      </p>
      {error && (
        <p className="mt-3 text-sm text-danger-600" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" size="sm" loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
