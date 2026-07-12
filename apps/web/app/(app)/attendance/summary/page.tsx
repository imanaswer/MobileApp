"use client";

import { Download, Users } from "lucide-react";
import { useState } from "react";

import { downloadCsv, SectionPicker } from "@/src/components/attendance/ui";
import { Button, type Column, DataTable, DateField, EmptyState } from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

const monthStart = () => `${new Date().toLocaleDateString("en-CA").slice(0, 8)}01`;

/**
 * Section attendance summary over a date range: each active student's % (ADR-011
 * §10 weighting — PRESENT/LATE 1, HALF_DAY 0.5, LEAVE excluded), computed on read
 * per enrollment. Exportable to CSV. No summary table, no cron.
 */
export default function AttendanceSummaryPage() {
  const [sectionId, setSectionId] = useState("");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => new Date().toLocaleDateString("en-CA"));

  const years = trpc.academicYear.list.useQuery();
  const activeYearId = (years.data ?? []).find((y) => y.status === "ACTIVE")?.id;

  const roster = trpc.enrollment.sectionRoster.useQuery(
    { academicYearId: activeYearId ?? "", sectionId },
    { enabled: sectionId !== "" && activeYearId !== undefined },
  );
  const active = (roster.data ?? []).filter((e) => e.status === "ACTIVE");

  const students = trpc.student.list.useQuery();
  const studentName = new Map(
    (students.data ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName}`]),
  );

  const summaries = trpc.useQueries((t) =>
    active.map((e) => t.attendance.summary({ enrollmentId: e.id, from, to })),
  );

  const table = active.map((e, i) => ({
    id: e.id,
    name: studentName.get(e.studentId) ?? e.studentId,
    summary: summaries[i]?.data,
  }));
  type Row = (typeof table)[number];

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Student",
      render: (r) => <span className="font-medium text-neutral-800">{r.name}</span>,
    },
    {
      key: "pct",
      header: "%",
      align: "right",
      render: (r) =>
        r.summary ? (r.summary.percentage == null ? "—" : `${r.summary.percentage}%`) : "…",
    },
    { key: "present", header: "Present", align: "right", render: (r) => r.summary?.present ?? "…" },
    { key: "absent", header: "Absent", align: "right", render: (r) => r.summary?.absent ?? "…" },
    { key: "late", header: "Late", align: "right", render: (r) => r.summary?.late ?? "…" },
    {
      key: "halfDay",
      header: "Half day",
      align: "right",
      render: (r) => r.summary?.halfDay ?? "…",
    },
    { key: "leave", header: "Leave", align: "right", render: (r) => r.summary?.leave ?? "…" },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SectionPicker onSection={setSectionId} />
        <DateField label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
        <DateField label="To" value={to} onChange={(e) => setTo(e.target.value)} />
        {table.length > 0 ? (
          <Button
            variant="secondary"
            icon={Download}
            onClick={() =>
              downloadCsv(`attendance-summary-${from}_${to}.csv`, [
                ["Student", "%", "Present", "Absent", "Late", "Half day", "Leave"],
                ...table.map((r) => [
                  r.name,
                  r.summary?.percentage == null ? "" : String(r.summary.percentage),
                  String(r.summary?.present ?? ""),
                  String(r.summary?.absent ?? ""),
                  String(r.summary?.late ?? ""),
                  String(r.summary?.halfDay ?? ""),
                  String(r.summary?.leave ?? ""),
                ]),
              ])
            }
          >
            Export CSV
          </Button>
        ) : null}
      </div>

      {sectionId === "" ? (
        <p className="text-sm text-neutral-500">Pick a section to summarise.</p>
      ) : (
        <DataTable
          columns={columns}
          rows={table}
          rowKey={(r) => r.id}
          loading={roster.isLoading}
          error={roster.isError}
          onRetry={() => roster.refetch()}
          empty={<EmptyState icon={Users} title="No active students in this section." />}
        />
      )}
    </section>
  );
}
