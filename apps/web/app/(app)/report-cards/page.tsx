"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { EnrollmentRosterRowDto, ReportCardKindKey, ReportCardStatusKey } from "@repo/types";
import { FileText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { KIND_LABEL } from "@/src/components/report-card/ui";
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  PageHeader,
  Select,
  StatusChip,
  TableToolbar,
  useToast,
  type Column,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

const KINDS: readonly ReportCardKindKey[] = ["EXAM", "TERM", "ANNUAL"];
const STATUSES: readonly ReportCardStatusKey[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "PUBLISHED",
  "SUPERSEDED",
  "REVOKED",
];

/**
 * Report Cards console (M7, ADR-014). Role-aware, thin transport: parents read their
 * children's PUBLISHED cards; admins (report_card:manage) and class teachers
 * (report_card:remark) work section rosters. The section list uses reportCard.listForSection
 * (ClassTeacherAssignment-scoped; carries studentName/rollNo); the admin Generate picker uses
 * enrollment.sectionRoster (studentName). The service is authoritative; this only hides UI.
 */
export default function ReportCardsPage() {
  const me = trpc.auth.me.useQuery();
  const role = me.data?.role;

  if (me.isLoading) {
    return <p className="p-6 text-neutral-500">Loading…</p>;
  }
  if (role === undefined || !can(role, PERMISSIONS.REPORT_CARD_READ)) {
    return <p className="p-6 text-neutral-500">You don’t have access to report cards.</p>;
  }

  return (
    <section className="flex flex-col gap-4 p-6">
      <PageHeader title="Report cards" />
      {role === "PARENT" ? (
        <ParentReportCards />
      ) : (
        <SectionReportCards canManage={can(role, PERMISSIONS.REPORT_CARD_MANAGE)} />
      )}
    </section>
  );
}

/* ---------------- Parent: own children's published cards ---------------- */

function ParentReportCards() {
  const children = trpc.student.list.useQuery();
  const rows = children.data ?? [];
  const [studentId, setStudentId] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <Select label="Child" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
        <option value="">Select a child…</option>
        {rows.map((s) => (
          <option key={s.id} value={s.id}>
            {s.firstName} {s.lastName} · {s.admissionNo}
          </option>
        ))}
      </Select>
      {children.isLoading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-neutral-500">No children are linked to your account.</p>
      ) : studentId ? (
        <ChildCards studentId={studentId} />
      ) : null}
    </div>
  );
}

function ChildCards({ studentId }: { studentId: string }) {
  const enrollments = trpc.enrollment.listByStudent.useQuery({ studentId });
  const active = (enrollments.data ?? []).find((e) => e.status === "ACTIVE");
  const cards = trpc.reportCard.listForEnrollment.useQuery(
    { enrollmentId: active?.id ?? "" },
    { enabled: active != null },
  );

  if (enrollments.isLoading) {
    return <p className="text-neutral-500">Loading…</p>;
  }
  if (active == null) {
    return <p className="text-neutral-500">No current enrollment for this child.</p>;
  }

  const rows = cards.data ?? [];
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: "kind",
      header: "Report card",
      render: (c) => (
        <span className="font-medium text-neutral-800">{KIND_LABEL[c.kind]} card</span>
      ),
    },
    {
      key: "rank",
      header: "Rank",
      render: (c) =>
        c.rank != null && c.cohortSize != null ? `${c.rank} of ${c.cohortSize}` : "—",
    },
    {
      key: "attendance",
      header: "Attendance",
      render: (c) => (c.attendancePercentage != null ? `${c.attendancePercentage}%` : "—"),
    },
    {
      key: "gpa",
      header: "GPA",
      render: (c) => (c.gpaSnapshot != null ? c.gpaSnapshot.toFixed(2) : "—"),
    },
    {
      key: "view",
      header: "",
      render: (c) => (
        <Link href={`/report-cards/${c.id}`} className="text-sm font-medium text-primary-700">
          View
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(c) => c.id}
      loading={cards.isLoading}
      error={cards.isError}
      onRetry={() => void cards.refetch()}
      empty={<EmptyState icon={FileText} title="No published report cards yet." />}
    />
  );
}

/* ---------------- Admin / class teacher: section roster ---------------- */

function SectionReportCards({ canManage }: { canManage: boolean }) {
  const me = trpc.auth.me.useQuery();
  const years = trpc.academicYear.list.useQuery();
  const classes = trpc.class.list.useQuery();
  const sectionLists = trpc.useQueries((t) =>
    (classes.data ?? []).map((c) => t.section.list({ classId: c.id })),
  );

  const activeYear = years.data?.find((y) => y.status === "ACTIVE");
  const [pickedYearId, setPickedYearId] = useState("");
  const yearId = pickedYearId || activeYear?.id || "";

  const className = useMemo(
    () => new Map((classes.data ?? []).map((c) => [c.id, c.name])),
    [classes.data],
  );
  const allSections = useMemo(() => sectionLists.flatMap((q) => q.data ?? []), [sectionLists]);
  const label = (s: { id: string; classId: string; name: string }) =>
    `${className.get(s.classId) ?? ""} ${s.name}`.trim() || s.id;

  // Class teachers only see sections they hold (composed from classTeacher.get — no
  // list endpoint; the service still gates every read). Admins see every section.
  const ctQueries = trpc.useQueries((t) =>
    !canManage && yearId
      ? allSections.map((s) => t.classTeacher.get({ academicYearId: yearId, sectionId: s.id }))
      : [],
  );
  const visibleSections = canManage
    ? allSections
    : allSections.filter((_, i) => ctQueries[i]?.data?.teacherId === me.data?.userId);

  const [sectionId, setSectionId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | ReportCardStatusKey>("");
  const [kindFilter, setKindFilter] = useState<"" | ReportCardKindKey>("");
  const [generating, setGenerating] = useState(false);

  // The LIST is driven by ClassTeacherAssignment (or admin) via reportCard.listForSection —
  // NOT by sectionRoster (which is TeacherAssignment-scoped), so a class teacher who teaches
  // no subject in their own section still sees the cards. The roster is fetched ONLY for
  // admins (roll labels + the Generate picker); it was never broken for them (isFullAccess).
  const cards = trpc.reportCard.listForSection.useQuery(
    { academicYearId: yearId, sectionId },
    { enabled: yearId !== "" && sectionId !== "" },
  );
  const roster = trpc.enrollment.sectionRoster.useQuery(
    { academicYearId: yearId, sectionId },
    { enabled: canManage && yearId !== "" && sectionId !== "" },
  );
  const rosterRows = roster.data ?? [];

  const flat = (cards.data ?? [])
    .filter((c) => (statusFilter ? c.status === statusFilter : true))
    .filter((c) => (kindFilter ? c.kind === kindFilter : true));

  const sectionsLoading = classes.isLoading || sectionLists.some((q) => q.isLoading);

  type Row = (typeof flat)[number];
  const columns: Column<Row>[] = [
    {
      key: "student",
      header: "Student",
      render: (card) => (
        <span className="text-neutral-800">
          {card.studentName}
          {card.rollNo != null ? (
            <span className="text-neutral-500"> · Roll {card.rollNo}</span>
          ) : null}
        </span>
      ),
    },
    { key: "kind", header: "Kind", render: (card) => KIND_LABEL[card.kind] },
    { key: "version", header: "Version", render: (card) => `v${card.version}` },
    { key: "status", header: "Status", render: (card) => <StatusChip status={card.status} /> },
    {
      key: "rank",
      header: "Rank",
      render: (card) =>
        card.rank != null && card.cohortSize != null ? `${card.rank} of ${card.cohortSize}` : "—",
    },
    {
      key: "open",
      header: "",
      render: (card) => (
        <Link href={`/report-cards/${card.id}`} className="text-sm font-medium text-primary-700">
          Open
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        rows={sectionId ? flat : []}
        rowKey={(card) => card.id}
        loading={sectionId ? cards.isLoading : false}
        error={sectionId ? cards.isError : false}
        onRetry={() => void cards.refetch()}
        toolbar={
          <TableToolbar
            filters={
              <>
                <Select
                  label="Academic year"
                  value={yearId}
                  onChange={(e) => setPickedYearId(e.target.value)}
                >
                  {(years.data ?? []).map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                      {y.status === "ACTIVE" ? " (active)" : ""}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Section"
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                  disabled={sectionsLoading}
                >
                  <option value="">Select a section…</option>
                  {visibleSections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {label(s)}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Kind"
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as "" | ReportCardKindKey)}
                >
                  <option value="">All</option>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as "" | ReportCardStatusKey)}
                >
                  <option value="">All</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </>
            }
            actions={
              canManage && sectionId ? (
                <Button icon={FileText} onClick={() => setGenerating(true)}>
                  Generate
                </Button>
              ) : undefined
            }
          />
        }
        empty={
          <EmptyState
            icon={FileText}
            title={
              sectionId
                ? "No report cards for this section yet."
                : "Pick a section to see its report cards."
            }
          />
        }
      />

      {generating ? (
        <GenerateModal yearId={yearId} roster={rosterRows} onClose={() => setGenerating(false)} />
      ) : null}
    </div>
  );
}

function GenerateModal({
  yearId,
  roster,
  onClose,
}: {
  yearId: string;
  roster: readonly EnrollmentRosterRowDto[];
  onClose: () => void;
}) {
  const { show } = useToast();
  const [enrollmentId, setEnrollmentId] = useState("");
  const [kind, setKind] = useState<ReportCardKindKey>("TERM");
  const [scopeId, setScopeId] = useState("");

  const exams = trpc.exam.list.useQuery({ academicYearId: yearId }, { enabled: kind === "EXAM" });
  const terms = trpc.academicTerm.list.useQuery(
    { academicYearId: yearId },
    { enabled: kind === "TERM" },
  );

  const utils = trpc.useUtils();
  const generate = trpc.reportCard.generate.useMutation({
    onSuccess: () => {
      void utils.reportCard.listForEnrollment.invalidate();
      show("success", "Report card generated");
      onClose();
    },
    onError: (e) => show("error", e.message),
  });

  const needsScope = kind !== "ANNUAL";
  const scopeOptions =
    kind === "EXAM"
      ? (exams.data ?? []).map((e) => ({ value: e.id, label: e.name }))
      : kind === "TERM"
        ? (terms.data ?? []).map((t) => ({ value: t.id, label: t.name }))
        : [];

  return (
    <Dialog title="Generate report card" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          generate.mutate({
            enrollmentId,
            kind,
            ...(kind === "EXAM" ? { examId: scopeId } : {}),
            ...(kind === "TERM" ? { termId: scopeId } : {}),
          });
        }}
        className="flex flex-col gap-3"
      >
        <Select
          label="Student"
          value={enrollmentId}
          onChange={(e) => setEnrollmentId(e.target.value)}
          required
        >
          <option value="">Select a student…</option>
          {roster.map((e) => (
            <option key={e.id} value={e.id}>
              {e.studentName}
              {e.rollNo != null ? ` · Roll ${e.rollNo}` : ""}
            </option>
          ))}
        </Select>
        <Select
          label="Kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as ReportCardKindKey);
            setScopeId("");
          }}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
        {needsScope ? (
          <Select
            label={kind === "EXAM" ? "Exam" : "Term"}
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {scopeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : null}
        {generate.error ? (
          <p className="text-sm text-danger-600">{generate.error.message}</p>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={generate.isPending}>
            Generate
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
