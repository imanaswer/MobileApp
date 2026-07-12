"use client";

import type { PeriodDto } from "@repo/types";
import { Plus } from "lucide-react";
import { useState } from "react";

import { YearSelect } from "@/src/components/timetable/ui";
import {
  Button,
  Card,
  type Column,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/** Bell schedule (one per year) + its period CRUD. Overlap/order conflicts surface on save. */
export default function SchedulePage() {
  const { show } = useToast();
  const [yearId, setYearId] = useState<string>();
  const utils = trpc.useUtils();

  const schedule = trpc.bellSchedule.getForYear.useQuery(
    { academicYearId: yearId! },
    { enabled: !!yearId },
  );
  const bellScheduleId = schedule.data?.id;
  const periods = trpc.period.list.useQuery(
    { bellScheduleId: bellScheduleId! },
    { enabled: !!bellScheduleId },
  );

  const createSchedule = trpc.bellSchedule.create.useMutation({
    onSuccess: () => {
      show("success", "Bell schedule created");
      return utils.bellSchedule.getForYear.invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const invalidatePeriods = () => utils.period.list.invalidate();
  const createPeriod = trpc.period.create.useMutation({
    onSuccess: () => {
      show("success", "Period created");
      return invalidatePeriods();
    },
    onError: (e) => show("error", e.message),
  });
  const updatePeriod = trpc.period.update.useMutation({
    onSuccess: () => {
      show("success", "Period updated");
      return invalidatePeriods();
    },
    onError: (e) => show("error", e.message),
  });
  const removePeriod = trpc.period.delete.useMutation({
    onSuccess: () => {
      show("success", "Period deleted");
      return invalidatePeriods();
    },
    onError: (e) => show("error", e.message),
  });

  const [editing, setEditing] = useState<PeriodDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<PeriodDto | null>(null);

  const columns: Column<PeriodDto>[] = [
    {
      key: "order",
      header: "#",
      render: (p) => <span className="text-neutral-500">{p.order}</span>,
    },
    {
      key: "name",
      header: "Name",
      render: (p) => <span className="font-medium text-neutral-800">{p.name}</span>,
    },
    {
      key: "time",
      header: "Time",
      render: (p) => (
        <span className="text-neutral-800">
          {p.startTime}–{p.endTime}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (p) => <span className="text-neutral-500">{p.isBreak ? "Break" : "Class"}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (p) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              createPeriod.reset();
              updatePeriod.reset();
              setEditing(p);
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger-600 hover:bg-danger-50"
            onClick={() => {
              removePeriod.reset();
              setDeleting(p);
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
      <YearSelect value={yearId} onChange={setYearId} />

      {!yearId ? (
        <p className="text-neutral-500">Select an academic year to manage its bell schedule.</p>
      ) : schedule.isLoading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : !schedule.data ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-neutral-800">This year has no bell schedule yet.</p>
          {createSchedule.error ? (
            <p className="text-sm text-danger-600">{createSchedule.error.message}</p>
          ) : null}
          <Button
            loading={createSchedule.isPending}
            onClick={() => createSchedule.mutate({ academicYearId: yearId, name: "Regular Day" })}
          >
            Create bell schedule
          </Button>
        </Card>
      ) : (
        <>
          <Card className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm text-neutral-500">Bell schedule</div>
              <div className="font-medium text-neutral-800">{schedule.data.name}</div>
            </div>
            <Button
              icon={Plus}
              onClick={() => {
                createPeriod.reset();
                updatePeriod.reset();
                setEditing("new");
              }}
            >
              New period
            </Button>
          </Card>

          <DataTable
            columns={columns}
            rows={periods.data ?? []}
            rowKey={(p) => p.id}
            loading={periods.isLoading}
            error={periods.isError}
            onRetry={() => periods.refetch()}
            empty={<EmptyState title="No periods yet. Add the first period to start the day." />}
          />
        </>
      )}

      {editing !== null && bellScheduleId ? (
        <PeriodFormModal
          period={editing === "new" ? null : editing}
          busy={createPeriod.isPending || updatePeriod.isPending}
          error={createPeriod.error?.message ?? updatePeriod.error?.message ?? null}
          onClose={() => setEditing(null)}
          onSubmit={(values) => {
            const done = { onSuccess: () => setEditing(null) };
            if (editing === "new") createPeriod.mutate({ bellScheduleId, ...values }, done);
            else updatePeriod.mutate({ id: editing.id, ...values }, done);
          }}
        />
      ) : null}

      {deleting !== null ? (
        <ConfirmDialog
          title="Delete period"
          objectName={deleting.name}
          message="Delete this period? Periods used by timetable entries cannot be deleted —"
          busy={removePeriod.isPending}
          error={removePeriod.error?.message ?? null}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            removePeriod.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })
          }
        />
      ) : null}
    </section>
  );
}

interface PeriodValues {
  name: string;
  order: number;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}

function PeriodFormModal({
  period,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  period: PeriodDto | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: PeriodValues) => void;
}) {
  const [name, setName] = useState(period?.name ?? "");
  const [order, setOrder] = useState(String(period?.order ?? ""));
  const [startTime, setStartTime] = useState(period?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(period?.endTime ?? "09:45");
  const [isBreak, setIsBreak] = useState(period?.isBreak ?? false);

  return (
    <Dialog title={period ? "Edit period" : "New period"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name: name.trim(), order: Number(order), startTime, endTime, isBreak });
        }}
        className="flex flex-col gap-4"
      >
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Period 1"
          required
        />
        <Input
          label="Order"
          type="number"
          min={1}
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          required
        />
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              label="Start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <Input
              label="End"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
          <input type="checkbox" checked={isBreak} onChange={(e) => setIsBreak(e.target.checked)} />
          This is a break (no class scheduled)
        </label>

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
