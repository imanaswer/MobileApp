"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { FeeStructureDto } from "@repo/types";
import { Wallet, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatPaise } from "@/src/components/fees/ui";
import {
  Banner,
  Button,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  StatusChip,
  useToast,
  type Column,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

interface DraftComponent {
  name: string;
  amount: string; // rupees, as typed
  mandatory: boolean;
}

const emptyComponent = (): DraftComponent => ({ name: "", amount: "", mandatory: true });

/**
 * Fee structures (M13, ADR-021 Step 7) — admin-only (fee:manage). Create/edit named,
 * per-year fee templates and their component lines. Editing components affects only
 * FUTURE invoices (issued invoices keep their snapshotted total — §2).
 */
export default function FeeStructuresPage() {
  const me = trpc.auth.me.useQuery();
  const role = me.data?.role;
  const canManage = role !== undefined && can(role, PERMISSIONS.FEE_MANAGE);
  const { show } = useToast();

  const years = trpc.academicYear.list.useQuery(undefined, { enabled: canManage });
  const list = trpc.fee.listStructures.useQuery({}, { enabled: canManage });
  const utils = trpc.useUtils();
  const rows = list.data ?? [];

  const [editing, setEditing] = useState<FeeStructureDto | "new" | null>(null);

  const refresh = () => void utils.fee.listStructures.invalidate();
  const create = trpc.fee.createStructure.useMutation({
    onSuccess: () => {
      refresh();
      setEditing(null);
      show("success", "Fee structure created");
    },
    onError: (e) => show("error", e.message),
  });
  const update = trpc.fee.updateStructure.useMutation({
    onSuccess: () => {
      refresh();
      setEditing(null);
      show("success", "Fee structure updated");
    },
    onError: (e) => show("error", e.message),
  });

  if (!me.isLoading && !canManage) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Banner tone="danger">You don’t have access to fee structures.</Banner>
      </main>
    );
  }

  const columns: Column<FeeStructureDto>[] = [
    {
      key: "name",
      header: "Name",
      render: (s) => <span className="font-medium text-neutral-800">{s.name}</span>,
    },
    {
      key: "year",
      header: "Year",
      render: (s) => years.data?.find((y) => y.id === s.academicYearId)?.name ?? "—",
    },
    { key: "components", header: "Components", render: (s) => s.components.length },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (s) =>
        formatPaise(s.components.reduce((sum, c) => sum + (c.mandatory ? c.amount : 0), 0)),
    },
    {
      key: "active",
      header: "Active",
      render: (s) => (
        <StatusChip tone={s.active ? "success" : "neutral"} label={s.active ? "Yes" : "No"} />
      ),
    },
    {
      key: "actions",
      header: "",
      render: (s) => (
        <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <PageHeader
        title="Fee structures"
        breadcrumb={
          <Link href="/fees" className="text-primary-700 hover:underline">
            ← Fees
          </Link>
        }
        action={
          <Button icon={Wallet} onClick={() => setEditing("new")}>
            New structure
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        empty={<EmptyState icon={Wallet} title="No fee structures yet." />}
      />

      {editing ? (
        <StructureModal
          initial={editing === "new" ? null : editing}
          years={(years.data ?? []).map((y) => ({ id: y.id, name: y.name }))}
          busy={create.isPending || update.isPending}
          error={(create.error ?? update.error)?.message ?? null}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => {
            if (editing === "new") {
              create.mutate(payload);
            } else {
              update.mutate({ id: editing.id, ...payload });
            }
          }}
        />
      ) : null}
    </main>
  );
}

const componentInputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-body text-neutral-800 placeholder:text-neutral-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600";

function StructureModal({
  initial,
  years,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  initial: FeeStructureDto | null;
  years: { id: string; name: string }[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    academicYearId: string;
    name: string;
    description: string | null;
    active?: boolean;
    components: { name: string; amount: number; order: number; mandatory: boolean }[];
  }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [academicYearId, setAcademicYearId] = useState(
    initial?.academicYearId ?? years[0]?.id ?? "",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [components, setComponents] = useState<DraftComponent[]>(
    initial
      ? initial.components.map((c) => ({
          name: c.name,
          amount: (c.amount / 100).toString(),
          mandatory: c.mandatory,
        }))
      : [emptyComponent()],
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const setComp = (i: number, patch: Partial<DraftComponent>) =>
    setComponents((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const submit = () => {
    const parsed = components
      .filter((c) => c.name.trim() !== "")
      .map((c, i) => ({
        name: c.name.trim(),
        amount: Math.round(Number(c.amount) * 100),
        order: i,
        mandatory: c.mandatory,
      }));
    if (!name.trim() || !academicYearId || parsed.length === 0) {
      setLocalError("Name, year and at least one component are required");
      return;
    }
    if (parsed.some((c) => !Number.isFinite(c.amount) || c.amount < 0)) {
      setLocalError("Every component needs a valid, non-negative amount");
      return;
    }
    setLocalError(null);
    onSubmit({
      academicYearId,
      name: name.trim(),
      description: description.trim() || null,
      ...(initial ? { active } : {}),
      components: parsed,
    });
  };

  return (
    <Dialog
      title={initial ? "Edit fee structure" : "New fee structure"}
      onClose={onClose}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Select
          label="Academic year"
          value={academicYearId}
          onChange={(e) => setAcademicYearId(e.target.value)}
          disabled={!!initial}
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </Select>
        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-neutral-800">Components (₹)</span>
          {components.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={componentInputClass}
                placeholder="Name (e.g. Tuition)"
                value={c.name}
                onChange={(e) => setComp(i, { name: e.target.value })}
              />
              <input
                className={`${componentInputClass} w-28`}
                placeholder="Amount"
                inputMode="decimal"
                value={c.amount}
                onChange={(e) => setComp(i, { amount: e.target.value })}
              />
              <label className="flex items-center gap-1 text-caption text-neutral-500">
                <input
                  type="checkbox"
                  checked={c.mandatory}
                  onChange={(e) => setComp(i, { mandatory: e.target.checked })}
                />
                Req.
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={X}
                aria-label="Remove component"
                onClick={() => setComponents((cs) => cs.filter((_, idx) => idx !== i))}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setComponents((cs) => [...cs, emptyComponent()])}
          >
            Add component
          </Button>
        </div>

        {initial ? (
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active (available for invoice generation)
          </label>
        ) : null}

        {(localError ?? error) ? (
          <p className="text-sm text-danger-600">{localError ?? error}</p>
        ) : null}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" loading={busy} onClick={submit}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
