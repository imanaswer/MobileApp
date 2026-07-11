"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { EnrollmentRosterRowDto, ReportCardKindKey, ReportCardStatusKey } from "@repo/types";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  inputClass,
  labelClass,
  Modal,
  outlineBtn,
  primaryBtn,
  TableShell,
} from "@/src/components/academic/ui";
import { KIND_LABEL, StatusBadge } from "@/src/components/report-card/ui";
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
    return <p className="p-6 text-muted-foreground">Loading…</p>;
  }
  if (role === undefined || !can(role, PERMISSIONS.REPORT_CARD_READ)) {
    return <p className="p-6 text-muted-foreground">You don’t have access to report cards.</p>;
  }

  return (
    <section className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold text-foreground">Report cards</h1>
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
      <label className={labelClass}>
        Child
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className={inputClass}
        >
          <option value="">Select a child…</option>
          {rows.map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName} · {s.admissionNo}
            </option>
          ))}
        </select>
      </label>
      {children.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">No children are linked to your account.</p>
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
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (active == null) {
    return <p className="text-muted-foreground">No current enrollment for this child.</p>;
  }
  return (
    <TableShell
      head={["Report card", "Rank", "Attendance", "GPA", ""]}
      isLoading={cards.isLoading}
      isError={cards.isError}
      isEmpty={(cards.data ?? []).length === 0}
      emptyText="No published report cards yet."
    >
      {(cards.data ?? []).map((c) => (
        <tr key={c.id} className="border-b border-border last:border-b-0">
          <td className="px-4 py-3 font-medium text-foreground">{KIND_LABEL[c.kind]} card</td>
          <td className="px-4 py-3 text-foreground">
            {c.rank != null && c.cohortSize != null ? `${c.rank} of ${c.cohortSize}` : "—"}
          </td>
          <td className="px-4 py-3 text-foreground">
            {c.attendancePercentage != null ? `${c.attendancePercentage}%` : "—"}
          </td>
          <td className="px-4 py-3 text-foreground">
            {c.gpaSnapshot != null ? c.gpaSnapshot.toFixed(2) : "—"}
          </td>
          <td className="px-4 py-3">
            <Link href={`/report-cards/${c.id}`} className="text-sm font-medium text-primary">
              View
            </Link>
          </td>
        </tr>
      ))}
    </TableShell>
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

  const cardsLoading = cards.isLoading;
  const cardsError = cards.isError;
  const sectionsLoading = classes.isLoading || sectionLists.some((q) => q.isLoading);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Academic year
          <select
            value={yearId}
            onChange={(e) => setPickedYearId(e.target.value)}
            className={inputClass}
          >
            {(years.data ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.status === "ACTIVE" ? " (active)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Section
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className={inputClass}
            disabled={sectionsLoading}
          >
            <option value="">Select a section…</option>
            {visibleSections.map((s) => (
              <option key={s.id} value={s.id}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Kind
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as "" | ReportCardKindKey)}
            className={inputClass}
          >
            <option value="">All</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | ReportCardStatusKey)}
            className={inputClass}
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {canManage && sectionId ? (
          <button type="button" onClick={() => setGenerating(true)} className={primaryBtn}>
            Generate
          </button>
        ) : null}
      </div>

      {!sectionId ? (
        <p className="text-muted-foreground">Pick a section to see its report cards.</p>
      ) : (
        <TableShell
          head={["Student", "Kind", "Version", "Status", "Rank", ""]}
          isLoading={cardsLoading}
          isError={cardsError}
          isEmpty={flat.length === 0}
          emptyText="No report cards for this section yet."
        >
          {flat.map((card) => (
            <tr key={card.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3 text-foreground">
                {card.studentName}
                {card.rollNo != null ? (
                  <span className="text-muted-foreground"> · Roll {card.rollNo}</span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-foreground">{KIND_LABEL[card.kind]}</td>
              <td className="px-4 py-3 text-foreground">v{card.version}</td>
              <td className="px-4 py-3">
                <StatusBadge status={card.status} />
              </td>
              <td className="px-4 py-3 text-foreground">
                {card.rank != null && card.cohortSize != null
                  ? `${card.rank} of ${card.cohortSize}`
                  : "—"}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/report-cards/${card.id}`}
                  className="text-sm font-medium text-primary"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </TableShell>
      )}

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
      onClose();
    },
  });

  const needsScope = kind !== "ANNUAL";
  const scopeOptions =
    kind === "EXAM"
      ? (exams.data ?? []).map((e) => ({ value: e.id, label: e.name }))
      : kind === "TERM"
        ? (terms.data ?? []).map((t) => ({ value: t.id, label: t.name }))
        : [];

  return (
    <Modal title="Generate report card" onClose={onClose}>
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
        <label className={labelClass}>
          Student
          <select
            value={enrollmentId}
            onChange={(e) => setEnrollmentId(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Select a student…</option>
            {roster.map((e) => (
              <option key={e.id} value={e.id}>
                {e.studentName}
                {e.rollNo != null ? ` · Roll ${e.rollNo}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Kind
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ReportCardKindKey);
              setScopeId("");
            }}
            className={inputClass}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        {needsScope ? (
          <label className={labelClass}>
            {kind === "EXAM" ? "Exam" : "Term"}
            <select
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              className={inputClass}
              required
            >
              <option value="">Select…</option>
              {scopeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {generate.error ? (
          <p className="text-sm text-destructive">{generate.error.message}</p>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={outlineBtn}>
            Cancel
          </button>
          <button type="submit" disabled={generate.isPending} className={primaryBtn}>
            {generate.isPending ? "Generating…" : "Generate"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
