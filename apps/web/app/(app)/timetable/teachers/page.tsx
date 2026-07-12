"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import {
  downloadCsv,
  entriesToCsv,
  TimetableGrid,
  YearSelect,
} from "@/src/components/timetable/ui";
import { Button, Select } from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/** Read-only teacher timetable — admin picks a teacher; their weekly grid + CSV export. */
export default function TeachersPage() {
  const [yearId, setYearId] = useState<string>();
  const [teacherId, setTeacherId] = useState<string>();

  const teachers = trpc.teacherProfile.list.useQuery();
  const schedule = trpc.bellSchedule.getForYear.useQuery(
    { academicYearId: yearId! },
    { enabled: !!yearId },
  );
  const periods = trpc.period.list.useQuery(
    { bellScheduleId: schedule.data?.id ?? "" },
    { enabled: !!schedule.data?.id },
  );
  const entries = trpc.timetable.byTeacher.useQuery(
    { academicYearId: yearId!, teacherId: teacherId! },
    { enabled: !!yearId && !!teacherId },
  );

  const rows = periods.data ?? [];
  const entryRows = entries.data ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <YearSelect value={yearId} onChange={setYearId} />
        <Select
          label="Teacher"
          value={teacherId ?? ""}
          onChange={(e) => setTeacherId(e.target.value || undefined)}
        >
          <option value="">Select…</option>
          {(teachers.data ?? []).map((t) => (
            <option key={t.userId} value={t.userId}>
              {t.name}
            </option>
          ))}
        </Select>
        {yearId && teacherId && entryRows.length > 0 ? (
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => {
              const { headers, rows: r } = entriesToCsv(entryRows);
              downloadCsv(`teacher-timetable-${teacherId}.csv`, headers, r);
            }}
          >
            Export CSV
          </Button>
        ) : null}
      </div>

      {!yearId || !teacherId ? (
        <p className="text-neutral-500">Pick a year and a teacher to view their timetable.</p>
      ) : !schedule.data ? (
        <p className="text-neutral-500">This year has no bell schedule yet.</p>
      ) : rows.length === 0 ? (
        <p className="text-neutral-500">The bell schedule has no periods yet.</p>
      ) : entryRows.length === 0 ? (
        <p className="text-neutral-500">This teacher has no scheduled classes this year.</p>
      ) : (
        <TimetableGrid periods={rows} entries={entryRows} />
      )}
    </section>
  );
}
