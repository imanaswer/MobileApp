"use client";

import type { AttendanceStatusKey } from "@repo/types";
import { Download, Users } from "lucide-react";
import { useState } from "react";

import { inputClass } from "@/src/components/academic/ui";
import {
  ATTENDANCE_STATUSES,
  downloadCsv,
  SectionPicker,
  STATUS_LABEL,
} from "@/src/components/attendance/ui";
import {
  Button,
  type Column,
  DataTable,
  DateField,
  EmptyState,
  StatusChip,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/**
 * Marking dashboard: pick a section + date, open (or resume) the daily register,
 * bulk-mark all present then flip absentees, save (idempotent upsert), and walk
 * the DRAFT→SUBMITTED→LOCKED machine (ADR-011 §5). Export the roster to CSV. All
 * rules/scope are enforced by the service — a section a teacher doesn't teach
 * errors cleanly.
 */
export default function MarkAttendancePage() {
  const { show } = useToast();
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [edits, setEdits] = useState<Record<string, AttendanceStatusKey>>({});

  const utils = trpc.useUtils();
  const years = trpc.academicYear.list.useQuery();
  const activeYearId = (years.data ?? []).find((y) => y.status === "ACTIVE")?.id;

  const ready = sectionId !== "" && date !== "" && activeYearId !== undefined;
  const sessionQuery = trpc.attendance.findSession.useQuery(
    { sectionId, sessionType: "DAILY", date },
    { enabled: ready },
  );
  const session = sessionQuery.data ?? null;

  const roster = trpc.attendance.roster.useQuery(
    { sessionId: session?.id ?? "" },
    { enabled: session !== null },
  );
  const students = trpc.student.list.useQuery();
  const studentName = new Map(
    (students.data ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName}`]),
  );

  const invalidateSession = () => void utils.attendance.findSession.invalidate();
  const openSession = trpc.attendance.openSession.useMutation({
    onSuccess: () => {
      show("success", "Register opened");
      invalidateSession();
    },
    onError: (e) => show("error", e.message),
  });
  const mark = trpc.attendance.mark.useMutation({
    onSuccess: () => {
      show("success", "Marks saved");
      setEdits({});
      void utils.attendance.roster.invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const submit = trpc.attendance.submit.useMutation({
    onSuccess: () => {
      show("success", "Register submitted");
      invalidateSession();
    },
    onError: (e) => show("error", e.message),
  });
  const lock = trpc.attendance.lock.useMutation({
    onSuccess: () => {
      show("success", "Register locked");
      invalidateSession();
    },
    onError: (e) => show("error", e.message),
  });

  const rows = roster.data ?? [];
  type Row = (typeof rows)[number];
  const isDraft = session?.status === "DRAFT";
  const effective = (r: Row) => edits[r.enrollmentId] ?? r.currentStatus ?? r.suggestedStatus;

  const columns: Column<Row>[] = [
    {
      key: "student",
      header: "Student",
      render: (r) => (
        <span className="font-medium text-neutral-800">
          {studentName.get(r.studentId) ?? r.studentId}
        </span>
      ),
    },
    {
      key: "rollNo",
      header: "Roll no",
      render: (r) => <span className="text-neutral-500">{r.rollNo ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) =>
        isDraft ? (
          <select
            aria-label={`Status for ${studentName.get(r.studentId) ?? r.studentId}`}
            value={effective(r)}
            onChange={(e) =>
              setEdits((prev) => ({
                ...prev,
                [r.enrollmentId]: e.target.value as AttendanceStatusKey,
              }))
            }
            className={inputClass}
          >
            {ATTENDANCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ) : (
          <StatusChip status={effective(r)} label={STATUS_LABEL[effective(r)]} />
        ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SectionPicker
          onSection={(id) => {
            setSectionId(id);
            setEdits({});
          }}
        />
        <DateField label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {!ready ? (
        <p className="text-sm text-neutral-500">Pick a section and date to load its register.</p>
      ) : sessionQuery.isLoading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : session === null ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-neutral-500">No register for {date} yet.</p>
          <Button
            loading={openSession.isPending}
            onClick={() => {
              if (activeYearId === undefined) return;
              openSession.mutate({
                academicYearId: activeYearId,
                sectionId,
                sessionType: "DAILY",
                date,
              });
            }}
          >
            Open register
          </Button>
          {openSession.error ? (
            <p className="text-sm text-danger-600">{openSession.error.message}</p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm text-neutral-500">
              {date} · <StatusChip status={session.status} />
            </span>
            <div className="flex flex-wrap gap-2">
              {isDraft ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setEdits(Object.fromEntries(rows.map((r) => [r.enrollmentId, "PRESENT"])))
                  }
                >
                  Mark all present
                </Button>
              ) : null}
              <Button
                variant="secondary"
                icon={Download}
                onClick={() =>
                  downloadCsv(`attendance-${date}.csv`, [
                    ["Student", "Roll no", "Status"],
                    ...rows.map((r) => [
                      studentName.get(r.studentId) ?? r.studentId,
                      r.rollNo == null ? "" : String(r.rollNo),
                      STATUS_LABEL[effective(r)],
                    ]),
                  ])
                }
              >
                Export CSV
              </Button>
            </div>
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.enrollmentId}
            loading={roster.isLoading}
            error={roster.isError}
            onRetry={() => roster.refetch()}
            empty={<EmptyState icon={Users} title="No active students in this section." />}
          />

          {isDraft ? (
            <div className="flex flex-wrap gap-2">
              <Button
                loading={mark.isPending}
                disabled={rows.length === 0}
                onClick={() =>
                  mark.mutate({
                    sessionId: session.id,
                    marks: rows.map((r) => ({
                      enrollmentId: r.enrollmentId,
                      status: effective(r),
                    })),
                  })
                }
              >
                Save marks
              </Button>
              <Button
                variant="secondary"
                loading={submit.isPending}
                onClick={() => submit.mutate({ sessionId: session.id })}
              >
                Submit register
              </Button>
            </div>
          ) : session.status === "SUBMITTED" ? (
            <Button
              variant="secondary"
              loading={lock.isPending}
              onClick={() => lock.mutate({ sessionId: session.id })}
            >
              Lock register
            </Button>
          ) : (
            <p className="text-sm text-neutral-500">
              Locked — changes now go through a correction.
            </p>
          )}
          {mark.error ? <p className="text-sm text-danger-600">{mark.error.message}</p> : null}
        </>
      )}
    </section>
  );
}
