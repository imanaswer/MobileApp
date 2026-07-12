"use client";

import { cn } from "@repo/ui";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

import { ErrorState, Skeleton } from "./feedback";

/**
 * DataTable (ADR-UX1 §component-kit) — sticky header, hover rows, right-aligned
 * numerics (tabular-nums), optional sortable headers, and built-in skeleton /
 * empty / error states so no consumer re-implements them. Hand-rolled (no table
 * lib): a styled wrapper over a column config.
 */
export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Mark sortable + wire `sort`/`onSort` to get the header affordance. */
  sortable?: boolean;
  render: (row: T) => ReactNode;
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  sort,
  onSort,
  toolbar,
  footer,
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  loading?: boolean | undefined;
  error?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  empty?: ReactNode;
  sort?: SortState | undefined;
  onSort?: ((key: string) => void) | undefined;
  toolbar?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {toolbar}
      <div className="overflow-x-auto rounded-card border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50">
            <tr>
              {columns.map((col) => {
                const active = sort?.key === col.key;
                const sortable = col.sortable && onSort;
                return (
                  <th
                    key={col.key}
                    aria-sort={
                      active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
                    }
                    className={cn(
                      "px-4 py-3 text-caption font-semibold uppercase tracking-wide text-neutral-500",
                      col.align === "right" && "text-right",
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort(col.key)}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 hover:text-neutral-800",
                          col.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {col.header}
                        {!active ? (
                          <ChevronsUpDown aria-hidden className="size-3.5" />
                        ) : sort.dir === "asc" ? (
                          <ChevronUp aria-hidden className="size-3.5" />
                        ) : (
                          <ChevronDown aria-hidden className="size-3.5" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, r) => (
                <tr key={r}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <ErrorState onRetry={onRetry} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={rowKey(row)} className="transition-colors hover:bg-neutral-50">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 text-neutral-800",
                        col.align === "right" && "text-right tabular-nums",
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

/** Standard toolbar row: filters (left) · search + actions (right). */
export function TableToolbar({
  filters,
  search,
  actions,
}: {
  filters?: ReactNode;
  search?: ReactNode;
  actions?: ReactNode;
}) {
  // ReactNode already includes undefined; no exactOptional concern.
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">{filters}</div>
      <div className="flex items-center gap-2">
        {search}
        {actions}
      </div>
    </div>
  );
}
