"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { AcademicYearDto, AcademicYearStatusKey } from "@repo/types";
import { Building2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { Paginator, usePagedSearch } from "@/src/components/academic/ui";
import {
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  DateField,
  Dialog,
  EmptyState,
  Input,
  Select,
  SearchInput,
  StatusChip,
  TableToolbar,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

const STATUS_OPTIONS: readonly AcademicYearStatusKey[] = ["PLANNED", "ACTIVE", "CLOSED"];

/** Academic-years CRUD. Terms are managed on the year's detail page. */
export default function AcademicYearsPage() {
  const { show } = useToast();
  const me = trpc.auth.me.useQuery();
  const canManage = me.data !== undefined && can(me.data.role, PERMISSIONS.ACADEMIC_MANAGE);

  const years = trpc.academicYear.list.useQuery();
  const utils = trpc.useUtils();
  const invalidate = () => utils.academicYear.list.invalidate();

  const create = trpc.academicYear.create.useMutation({
    onSuccess: () => {
      show("success", "Academic year created");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const update = trpc.academicYear.update.useMutation({
    onSuccess: () => {
      show("success", "Academic year updated");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.academicYear.delete.useMutation({
    onSuccess: () => {
      show("success", "Academic year deleted");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  const [editing, setEditing] = useState<AcademicYearDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<AcademicYearDto | null>(null);

  const paged = usePagedSearch(
    years.data,
    useCallback((year: AcademicYearDto, q: string) => year.name.toLowerCase().includes(q), []),
  );

  const columns: Column<AcademicYearDto>[] = [
    {
      key: "name",
      header: "Name",
      render: (year) => <span className="font-medium text-neutral-800">{year.name}</span>,
    },
    {
      key: "start",
      header: "Start",
      render: (year) => <span className="text-neutral-500">{year.startDate}</span>,
    },
    {
      key: "end",
      header: "End",
      render: (year) => <span className="text-neutral-500">{year.endDate}</span>,
    },
    { key: "status", header: "Status", render: (year) => <StatusChip status={year.status} /> },
    {
      key: "terms",
      header: "Terms",
      render: (year) => (
        <Link
          href={`/academic/years/${year.id}`}
          className="font-medium text-primary-700 hover:underline"
        >
          Manage terms
        </Link>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (year) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                create.reset();
                update.reset();
                setEditing(year);
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
                setDeleting(year);
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
      <DataTable
        columns={columns}
        rows={paged.pageItems}
        rowKey={(year) => year.id}
        loading={years.isLoading}
        error={years.isError}
        onRetry={() => years.refetch()}
        toolbar={
          <TableToolbar
            search={
              <SearchInput value={paged.query} onChange={(e) => paged.setQuery(e.target.value)} />
            }
            actions={
              canManage ? (
                <Button
                  icon={Plus}
                  onClick={() => {
                    create.reset();
                    update.reset();
                    setEditing("new");
                  }}
                >
                  New academic year
                </Button>
              ) : undefined
            }
          />
        }
        empty={<EmptyState icon={Building2} title="No academic years yet." />}
        footer={
          <Paginator
            page={paged.page}
            pageCount={paged.pageCount}
            total={paged.total}
            onPage={paged.setPage}
          />
        }
      />

      {editing !== null ? (
        <YearFormModal
          year={editing === "new" ? null : editing}
          busy={create.isPending || update.isPending}
          error={create.error?.message ?? update.error?.message ?? null}
          onClose={() => setEditing(null)}
          onSubmit={(values) => {
            const done = { onSuccess: () => setEditing(null) };
            if (editing === "new") create.mutate(values, done);
            else update.mutate({ id: editing.id, ...values }, done);
          }}
        />
      ) : null}

      {deleting !== null ? (
        <ConfirmDialog
          title="Delete academic year"
          objectName={deleting.name}
          message="Permanently delete this year and its terms? This cannot be undone —"
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

function YearFormModal({
  year,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  year: AcademicYearDto | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    startDate: string;
    endDate: string;
    status: AcademicYearStatusKey;
  }) => void;
}) {
  const [name, setName] = useState(year?.name ?? "");
  const [startDate, setStartDate] = useState<string>(year?.startDate ?? "");
  const [endDate, setEndDate] = useState<string>(year?.endDate ?? "");
  const [status, setStatus] = useState<AcademicYearStatusKey>(year?.status ?? "PLANNED");

  return (
    <Dialog title={year ? "Edit academic year" : "New academic year"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name: name.trim(), startDate, endDate, status });
        }}
        className="flex flex-col gap-4"
      >
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="2026–27"
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
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as AcademicYearStatusKey)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>

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
