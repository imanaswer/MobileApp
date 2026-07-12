"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Legacy M2 CRUD primitives. The full component kit (ADR-UX1 Step 2) now lives in
 * `@/src/components/ui` and is re-exported below, so existing screens importing
 * from here keep working while Step 4 migrates them onto the new components.
 * These legacy class constants + Modal/TableShell/etc. remain until migrated.
 */
export * from "@/src/components/ui";

export const inputClass =
  "rounded-md border border-input px-3 py-2 text-foreground disabled:opacity-60";
export const primaryBtn =
  "min-h-11 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60";
export const outlineBtn =
  "min-h-11 rounded-md border border-border px-4 py-2 font-medium text-foreground disabled:opacity-60";
export const destructiveBtn =
  "min-h-11 rounded-md bg-destructive px-4 py-2 font-medium text-destructive-foreground disabled:opacity-60";
export const smallGhostBtn =
  "rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-accent disabled:opacity-60";
export const smallDangerBtn =
  "rounded-md px-2 py-1 text-sm font-medium text-destructive hover:bg-accent disabled:opacity-60";
export const labelClass = "flex flex-col gap-1 text-sm font-medium text-foreground";

/** Modal dialog: overlay + Esc/backdrop close, initial focus inside. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        <h2 className="mb-4 text-xl font-semibold text-foreground">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Destructive confirm dialog naming the consequence (UI_DESIGN_SYSTEM.md §11). */
export function ConfirmDelete({
  title,
  message,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="mb-4 text-sm text-muted-foreground">{message}</p>
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={outlineBtn}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={destructiveBtn}>
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Modal>
  );
}

/** Table wrapper with mandatory loading / error / empty states (§9). */
export function TableShell({
  head,
  isLoading,
  isError,
  isEmpty,
  emptyText,
  children,
}: {
  head: readonly string[];
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium text-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <StateRow colSpan={head.length}>Loading…</StateRow>
          ) : isError ? (
            <StateRow colSpan={head.length}>
              <span className="text-destructive">
                Couldn’t load this list. You may not have access, or the server is unreachable.
              </span>
            </StateRow>
          ) : isEmpty ? (
            <StateRow colSpan={head.length}>{emptyText}</StateRow>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

function StateRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

const PAGE_SIZE = 10;

/**
 * Client-side search + pagination over a fully fetched list. The academic API
 * (Step 5) returns bounded full lists (years/classes/subjects are small,
 * single-tenant); cursor pagination arrives with genuinely unbounded data.
 */
export function usePagedSearch<T>(
  items: readonly T[] | undefined,
  matches: (item: T, query: string) => boolean,
) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const all = items ?? [];
    const q = query.trim().toLowerCase();
    return q ? all.filter((item) => matches(item, q)) : all;
  }, [items, query, matches]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return {
    query,
    setQuery: (value: string) => {
      setQuery(value);
      setPage(1);
    },
    page: safePage,
    setPage,
    pageCount,
    pageItems,
    total: filtered.length,
  };
}

/** Search box + optional primary action, above a table. */
export function ListToolbar({
  searchValue,
  onSearch,
  searchLabel,
  action,
}: {
  searchValue: string;
  onSearch: (value: string) => void;
  searchLabel: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className={labelClass}>
        {searchLabel}
        <input
          type="search"
          value={searchValue}
          onChange={(e) => onSearch(e.target.value)}
          className={`${inputClass} w-64`}
          placeholder="Search…"
        />
      </label>
      {action}
    </div>
  );
}

/** Prev/next pager for client-side pages. */
export function Paginator({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Page {page} of {pageCount} · {total} total
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className={outlineBtn}
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          className={outlineBtn}
        >
          Next
        </button>
      </div>
    </div>
  );
}
