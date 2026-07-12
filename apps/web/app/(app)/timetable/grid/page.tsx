"use client";

import type { PeriodDto, TimetableEntryDto, WeekdayKey } from "@repo/types";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import {
  downloadCsv,
  entriesToCsv,
  TimetableGrid,
  WEEKDAYS,
  YearSelect,
} from "@/src/components/timetable/ui";
import { Button, Dialog, Input, Select, useToast } from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/** Section weekly grid — click a cell to add/edit an entry. Conflicts surface on save. */
export default function GridPage() {
  const { show } = useToast();
  const [yearId, setYearId] = useState<string>();
  const [classId, setClassId] = useState<string>();
  const [sectionId, setSectionId] = useState<string>();

  const classes = trpc.class.list.useQuery();
  const sections = trpc.section.list.useQuery({ classId: classId! }, { enabled: !!classId });
  const schedule = trpc.bellSchedule.getForYear.useQuery(
    { academicYearId: yearId! },
    { enabled: !!yearId },
  );
  const periods = trpc.period.list.useQuery(
    { bellScheduleId: schedule.data?.id ?? "" },
    { enabled: !!schedule.data?.id },
  );
  const entries = trpc.timetable.bySection.useQuery(
    { academicYearId: yearId!, sectionId: sectionId! },
    { enabled: !!yearId && !!sectionId },
  );

  const utils = trpc.useUtils();
  const invalidate = () => utils.timetable.bySection.invalidate();
  const createEntry = trpc.timetable.createEntry.useMutation({
    onSuccess: () => {
      show("success", "Timetable entry added");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const updateEntry = trpc.timetable.updateEntry.useMutation({
    onSuccess: () => {
      show("success", "Timetable entry updated");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const removeEntry = trpc.timetable.deleteEntry.useMutation({
    onSuccess: () => {
      show("success", "Timetable entry removed");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  const [cell, setCell] = useState<{ weekday: WeekdayKey; period: PeriodDto } | null>(null);

  const rows = periods.data ?? [];
  const entryRows = entries.data ?? [];
  const ready = !!yearId && !!sectionId && !!schedule.data;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <YearSelect value={yearId} onChange={setYearId} />
        <Select
          label="Class"
          value={classId ?? ""}
          onChange={(e) => {
            setClassId(e.target.value || undefined);
            setSectionId(undefined);
          }}
        >
          <option value="">Select…</option>
          {(classes.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          label="Section"
          value={sectionId ?? ""}
          onChange={(e) => setSectionId(e.target.value || undefined)}
          disabled={!classId}
        >
          <option value="">Select…</option>
          {(sections.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        {ready && entryRows.length > 0 ? (
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => {
              const { headers, rows: r } = entriesToCsv(entryRows);
              downloadCsv(`timetable-${sectionId}.csv`, headers, r);
            }}
          >
            Export CSV
          </Button>
        ) : null}
      </div>

      {!yearId || !sectionId ? (
        <p className="text-neutral-500">Pick a year, class, and section to view the timetable.</p>
      ) : !schedule.data ? (
        <p className="text-neutral-500">
          This year has no bell schedule yet. Set it up under “Bell schedule &amp; periods” first.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-neutral-500">The bell schedule has no periods yet. Add periods first.</p>
      ) : (
        <TimetableGrid
          periods={rows}
          entries={entryRows}
          onCell={(weekday, period) => setCell({ weekday, period })}
        />
      )}

      {cell && yearId && sectionId ? (
        <EntryModal
          sectionId={sectionId}
          weekday={cell.weekday}
          period={cell.period}
          existing={entryRows.find(
            (e) => e.weekday === cell.weekday && e.periodId === cell.period.id,
          )}
          busy={createEntry.isPending || updateEntry.isPending || removeEntry.isPending}
          error={
            createEntry.error?.message ??
            updateEntry.error?.message ??
            removeEntry.error?.message ??
            null
          }
          onClose={() => setCell(null)}
          onCreate={(v) =>
            createEntry.mutate(
              {
                academicYearId: yearId,
                sectionId,
                periodId: cell.period.id,
                weekday: cell.weekday,
                ...v,
              },
              { onSuccess: () => setCell(null) },
            )
          }
          onUpdate={(id, v) => updateEntry.mutate({ id, ...v }, { onSuccess: () => setCell(null) })}
          onDelete={(id) => removeEntry.mutate({ id }, { onSuccess: () => setCell(null) })}
        />
      ) : null}
    </section>
  );
}

interface EntryValues {
  subjectId: string;
  teacherId: string;
  room: string | null;
}

function EntryModal({
  sectionId,
  weekday,
  period,
  existing,
  busy,
  error,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  sectionId: string;
  weekday: WeekdayKey;
  period: PeriodDto;
  existing?: TimetableEntryDto | undefined;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (v: EntryValues) => void;
  onUpdate: (id: string, v: EntryValues) => void;
  onDelete: (id: string) => void;
}) {
  // Valid (subject, teacher) pairs for this section = its TeacherAssignments (ownership rule).
  const assignments = trpc.teacherAssignment.list.useQuery({ sectionId });
  const subjects = trpc.subject.list.useQuery();
  const teachers = trpc.teacherProfile.list.useQuery();

  const subjectName = useMemo(
    () => new Map((subjects.data ?? []).map((s) => [s.id, s.name])),
    [subjects.data],
  );
  const teacherName = useMemo(
    () => new Map((teachers.data ?? []).map((t) => [t.userId, t.name])),
    [teachers.data],
  );

  const options = (assignments.data ?? []).map((a) => ({
    value: `${a.subjectId}|${a.teacherId}`,
    label: `${subjectName.get(a.subjectId) ?? "Subject"} — ${teacherName.get(a.teacherId) ?? "Teacher"}`,
  }));

  const [pair, setPair] = useState(existing ? `${existing.subjectId}|${existing.teacherId}` : "");
  const [room, setRoom] = useState(existing?.room ?? "");
  const dayLabel = WEEKDAYS.find((d) => d.key === weekday)?.label ?? weekday;

  const submit = () => {
    const [subjectId, teacherId] = pair.split("|");
    if (!subjectId || !teacherId) return;
    const values: EntryValues = { subjectId, teacherId, room: room.trim() || null };
    if (existing) onUpdate(existing.id, values);
    else onCreate(values);
  };

  return (
    <Dialog
      title={`${dayLabel} · ${period.name} (${period.startTime}–${period.endTime})`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <Select
          label="Subject — Teacher"
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          helper={
            options.length === 0
              ? "No teacher assignments in this section yet — add one under Academic → Teacher assignments."
              : undefined
          }
          required
        >
          <option value="" disabled>
            Select an assignment…
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Input
          label="Room (optional)"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Room 12"
        />

        {error ? <p className="text-sm text-danger-600">{error}</p> : null}

        <div className="mt-1 flex justify-between gap-2">
          <div>
            {existing ? (
              <Button
                type="button"
                variant="ghost"
                className="text-danger-600 hover:bg-danger-50"
                disabled={busy}
                onClick={() => onDelete(existing.id)}
              >
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={busy || !pair}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
