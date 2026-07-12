"use client";

import type { HolidayDto, HolidayTypeKey } from "@repo/types";
import { CalendarOff } from "lucide-react";
import { useState } from "react";

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
  StatusChip,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

const HOLIDAY_TYPES: readonly HolidayTypeKey[] = [
  "NATIONAL",
  "SCHOOL",
  "FESTIVAL",
  "EMERGENCY_CLOSURE",
];

/**
 * Holiday calendar management (admin, ACADEMIC_MANAGE — ADR-011 §9). One holiday
 * per date per year; a session cannot be opened on a holiday, so this is where
 * the working-day calendar is curated.
 */
export default function HolidaysPage() {
  const { show } = useToast();
  const years = trpc.academicYear.list.useQuery();
  const [academicYearId, setAcademicYearId] = useState("");
  const holidays = trpc.holiday.list.useQuery(
    { academicYearId },
    { enabled: academicYearId !== "" },
  );

  const utils = trpc.useUtils();
  const invalidate = () => void utils.holiday.list.invalidate({ academicYearId });
  const create = trpc.holiday.create.useMutation({
    onSuccess: () => {
      show("success", "Holiday added");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.holiday.delete.useMutation({
    onSuccess: () => {
      show("success", "Holiday deleted");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<HolidayDto | null>(null);

  const rows = holidays.data ?? [];

  const columns: Column<HolidayDto>[] = [
    {
      key: "date",
      header: "Date",
      render: (h) => <span className="font-medium text-neutral-800">{h.date}</span>,
    },
    {
      key: "name",
      header: "Name",
      render: (h) => <span className="text-neutral-500">{h.name}</span>,
    },
    { key: "type", header: "Type", render: (h) => <StatusChip status={h.type} /> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (h) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-danger-600 hover:bg-danger-50"
            onClick={() => {
              remove.reset();
              setDeleting(h);
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Select
          label="Academic year"
          value={academicYearId}
          onChange={(e) => setAcademicYearId(e.target.value)}
        >
          <option value="">Select a year…</option>
          {(years.data ?? []).map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </Select>
        {academicYearId !== "" ? (
          <Button
            onClick={() => {
              create.reset();
              setCreating(true);
            }}
          >
            New holiday
          </Button>
        ) : null}
      </div>

      {academicYearId === "" ? (
        <p className="text-sm text-neutral-500">Pick a year to manage its holidays.</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(h) => h.id}
          loading={holidays.isLoading}
          error={holidays.isError}
          onRetry={() => holidays.refetch()}
          empty={<EmptyState icon={CalendarOff} title="No holidays for this year." />}
        />
      )}

      {creating ? (
        <HolidayModal
          busy={create.isPending}
          error={create.error?.message ?? null}
          onClose={() => setCreating(false)}
          onSubmit={(values) =>
            create.mutate({ academicYearId, ...values }, { onSuccess: () => setCreating(false) })
          }
        />
      ) : null}

      {deleting !== null ? (
        <ConfirmDialog
          title="Delete holiday"
          objectName={deleting.name}
          message={`Delete this holiday on ${deleting.date}? Attendance can then be recorded on that day —`}
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

function HolidayModal({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { name: string; date: string; type: HolidayTypeKey }) => void;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<HolidayTypeKey>("SCHOOL");

  return (
    <Dialog title="New holiday" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name, date, type });
        }}
        className="flex flex-col gap-4"
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <DateField label="Date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as HolidayTypeKey)}
        >
          {HOLIDAY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
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
