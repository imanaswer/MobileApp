"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { AcademicTermDto } from "@repo/types";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import {
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  DateField,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  StatusChip,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/** Terms of one academic year (year detail). Term dates must not overlap. */
export default function AcademicYearDetailPage() {
  const { show } = useToast();
  const params = useParams<{ id: string }>();
  const yearId = params.id;

  const me = trpc.auth.me.useQuery();
  const canManage = me.data !== undefined && can(me.data.role, PERMISSIONS.ACADEMIC_MANAGE);

  const year = trpc.academicYear.get.useQuery({ id: yearId });
  const terms = trpc.academicTerm.list.useQuery({ academicYearId: yearId });
  const utils = trpc.useUtils();
  const invalidate = () => utils.academicTerm.list.invalidate({ academicYearId: yearId });

  const create = trpc.academicTerm.create.useMutation({
    onSuccess: () => {
      show("success", "Term created");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const update = trpc.academicTerm.update.useMutation({
    onSuccess: () => {
      show("success", "Term updated");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.academicTerm.delete.useMutation({
    onSuccess: () => {
      show("success", "Term deleted");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  const [editing, setEditing] = useState<AcademicTermDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<AcademicTermDto | null>(null);

  if (year.isError) {
    return (
      <section className="flex flex-col gap-3">
        <ErrorState message="Academic year not found." />
        <Link href="/academic/years" className="text-sm text-primary-700 hover:underline">
          ← Back to academic years
        </Link>
      </section>
    );
  }

  const columns: Column<AcademicTermDto>[] = [
    {
      key: "name",
      header: "Name",
      render: (term) => <span className="font-medium text-neutral-800">{term.name}</span>,
    },
    {
      key: "start",
      header: "Start",
      render: (term) => <span className="text-neutral-500">{term.startDate}</span>,
    },
    {
      key: "end",
      header: "End",
      render: (term) => <span className="text-neutral-500">{term.endDate}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (term) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                create.reset();
                update.reset();
                setEditing(term);
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-600 hover:bg-danger-50"
              onClick={() => {
                remove.reset();
                setDeleting(term);
              }}
            >
              Delete
            </Button>
          </div>
        ) : (
          <span className="text-neutral-400">—</span>
        ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={
          <Link href="/academic/years" className="text-primary-700 hover:underline">
            ← Academic years
          </Link>
        }
        title={year.data ? `Terms — ${year.data.name}` : "Terms"}
        action={
          canManage ? (
            <Button
              icon={Plus}
              onClick={() => {
                create.reset();
                update.reset();
                setEditing("new");
              }}
            >
              New term
            </Button>
          ) : undefined
        }
      />

      {year.data ? (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <span>
            {year.data.startDate} → {year.data.endDate}
          </span>
          <StatusChip status={year.data.status} />
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={terms.data ?? []}
        rowKey={(term) => term.id}
        loading={terms.isLoading}
        error={terms.isError}
        onRetry={() => terms.refetch()}
        empty={<EmptyState title="No terms in this year yet." />}
      />

      {editing !== null ? (
        <TermFormModal
          term={editing === "new" ? null : editing}
          busy={create.isPending || update.isPending}
          error={create.error?.message ?? update.error?.message ?? null}
          onClose={() => setEditing(null)}
          onSubmit={(values) => {
            const done = { onSuccess: () => setEditing(null) };
            if (editing === "new") create.mutate({ academicYearId: yearId, ...values }, done);
            else update.mutate({ id: editing.id, ...values }, done);
          }}
        />
      ) : null}

      {deleting !== null ? (
        <ConfirmDialog
          title="Delete term"
          objectName={deleting.name}
          message="Permanently delete this term? This cannot be undone —"
          busy={remove.isPending}
          error={remove.error?.message ?? null}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })
          }
        />
      ) : null}
    </section>
  );
}

function TermFormModal({
  term,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  term: AcademicTermDto | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { name: string; startDate: string; endDate: string }) => void;
}) {
  const [name, setName] = useState(term?.name ?? "");
  const [startDate, setStartDate] = useState<string>(term?.startDate ?? "");
  const [endDate, setEndDate] = useState<string>(term?.endDate ?? "");

  return (
    <Dialog title={term ? "Edit term" : "New term"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name: name.trim(), startDate, endDate });
        }}
        className="flex flex-col gap-4"
      >
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Term 1"
          required
        />
        <DateField
          label="Start date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
        <DateField
          label="End date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          required
        />

        {error ? <p className="text-sm text-danger-600">{error}</p> : null}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
