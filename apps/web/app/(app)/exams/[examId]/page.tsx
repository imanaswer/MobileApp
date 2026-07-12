"use client";

import type { AssessmentDto, ExamRegisterDto } from "@repo/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  ConfirmDelete,
  inputClass,
  labelClass,
  Modal,
  TableShell,
} from "@/src/components/academic/ui";
import { downloadCsv, SectionPicker } from "@/src/components/attendance/ui";
import { REGISTER_STATUS_LABEL } from "@/src/components/exam/ui";
import { Button, PageHeader, StatusChip, useToast } from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/** A picked (assessment × section) target for the marks grid. */
type Target = { assessmentId: string; sectionId: string };

/**
 * Exam detail (M5, ADR-012). Assessment CRUD, the register oversight list, and
 * the marks grid — admins can enter/save marks, then walk the register lifecycle
 * (submit → lock, or unlock a locked register with an audited reason). Teachers do
 * the day-to-day entry on mobile; this is the management + oversight side.
 */
export default function ExamDetailPage() {
  const examId = String(useParams().examId ?? "");
  const exam = trpc.exam.get.useQuery({ examId }, { enabled: examId !== "" });
  const assessments = trpc.assessment.list.useQuery({ examId }, { enabled: examId !== "" });
  const registers = trpc.exam.registers.useQuery({ examId }, { enabled: examId !== "" });
  const subjects = trpc.subject.list.useQuery();

  const subjectName = useMemo(
    () => new Map((subjects.data ?? []).map((s) => [s.id, s.name])),
    [subjects.data],
  );

  const [target, setTarget] = useState<Target | null>(null);

  const published = exam.data?.isPublished ?? false;
  const assessmentRows = [...(assessments.data ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
  const registerRows = registers.data ?? [];

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title={exam.data?.name ?? "Exam"}
        breadcrumb={
          <Link href="/exams" className="text-primary-700 hover:underline">
            ← All exams
          </Link>
        }
        action={
          published ? (
            <div className="flex items-center gap-2">
              <StatusChip status="PUBLISHED" />
              <span className="text-sm text-neutral-500">read only</span>
            </div>
          ) : undefined
        }
      />

      <Assessments
        examId={examId}
        rows={assessmentRows}
        subjectName={subjectName}
        subjects={subjects.data ?? []}
        published={published}
        isLoading={assessments.isLoading}
        isError={assessments.isError}
      />

      <div className="flex flex-col gap-3">
        <h3 className="text-title text-neutral-800">Registers</h3>
        <TableShell
          head={["Subject", "Section", "Status", ""]}
          isLoading={registers.isLoading}
          isError={registers.isError}
          isEmpty={registerRows.length === 0}
          emptyText="No registers yet — start one below."
        >
          {registerRows.map((r) => (
            <tr key={r.examSectionId} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3 font-medium text-foreground">{r.subjectName}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.sectionName}</td>
              <td className="px-4 py-3">
                <StatusChip status={r.status} label={REGISTER_STATUS_LABEL[r.status]} />
              </td>
              <td className="px-4 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setTarget({ assessmentId: r.assessmentId, sectionId: r.sectionId })
                  }
                >
                  Open
                </Button>
              </td>
            </tr>
          ))}
        </TableShell>

        <StartRegister
          assessments={assessmentRows}
          subjectName={subjectName}
          disabled={assessmentRows.length === 0}
          onOpen={setTarget}
        />
      </div>

      {target !== null && exam.data ? (
        <MarksGrid
          key={`${target.assessmentId}:${target.sectionId}`}
          academicYearId={exam.data.academicYearId}
          assessment={assessmentRows.find((a) => a.id === target.assessmentId) ?? null}
          register={
            registerRows.find(
              (r) => r.assessmentId === target.assessmentId && r.sectionId === target.sectionId,
            ) ?? null
          }
          subjectLabel={subjectName.get(
            assessmentRows.find((a) => a.id === target.assessmentId)?.subjectId ?? "",
          )}
          target={target}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- Assessments */

function Assessments({
  examId,
  rows,
  subjects,
  subjectName,
  published,
  isLoading,
  isError,
}: {
  examId: string;
  rows: AssessmentDto[];
  subjects: { id: string; name: string }[];
  subjectName: Map<string, string>;
  published: boolean;
  isLoading: boolean;
  isError: boolean;
}) {
  const { show } = useToast();
  const utils = trpc.useUtils();
  const invalidate = () => utils.assessment.list.invalidate();
  const create = trpc.assessment.create.useMutation({
    onSuccess: () => {
      void invalidate();
      show("success", "Assessment added");
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.assessment.delete.useMutation({
    onSuccess: () => {
      void invalidate();
      show("success", "Assessment deleted");
    },
    onError: (e) => show("error", e.message),
  });

  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AssessmentDto | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-title text-neutral-800">Assessments</h3>
        {published ? null : (
          <Button
            onClick={() => {
              create.reset();
              setAdding(true);
            }}
          >
            Add assessment
          </Button>
        )}
      </div>

      <TableShell
        head={["Subject", "Max theory", "Max practical", "Pass mark", "Actions"]}
        isLoading={isLoading}
        isError={isError}
        isEmpty={rows.length === 0}
        emptyText="No assessments yet."
      >
        {rows.map((a) => (
          <tr key={a.id} className="border-b border-border last:border-b-0">
            <td className="px-4 py-3 font-medium text-foreground">
              {subjectName.get(a.subjectId) ?? "—"}
            </td>
            <td className="px-4 py-3 text-muted-foreground">{a.maxTheory}</td>
            <td className="px-4 py-3 text-muted-foreground">{a.maxPractical ?? "—"}</td>
            <td className="px-4 py-3 text-muted-foreground">{a.passMark}</td>
            <td className="px-4 py-3">
              {published ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    remove.reset();
                    setDeleting(a);
                  }}
                >
                  Delete
                </Button>
              )}
            </td>
          </tr>
        ))}
      </TableShell>

      {adding ? (
        <AssessmentFormModal
          subjects={subjects.filter((s) => !rows.some((a) => a.subjectId === s.id))}
          busy={create.isPending}
          error={create.error?.message ?? null}
          onClose={() => setAdding(false)}
          onSubmit={(values) =>
            create.mutate({ examId, ...values }, { onSuccess: () => setAdding(false) })
          }
        />
      ) : null}

      {deleting !== null ? (
        <ConfirmDelete
          title="Delete assessment"
          message={`Delete the ${subjectName.get(deleting.subjectId) ?? "subject"} assessment? An assessment with marks cannot be deleted.`}
          busy={remove.isPending}
          error={remove.error?.message ?? null}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate({ assessmentId: deleting.id }, { onSuccess: () => setDeleting(null) })
          }
        />
      ) : null}
    </div>
  );
}

function AssessmentFormModal({
  subjects,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  subjects: { id: string; name: string }[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: {
    subjectId: string;
    maxTheory: number;
    maxPractical: number | null;
    passMark: number;
  }) => void;
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [maxTheory, setMaxTheory] = useState("100");
  const [maxPractical, setMaxPractical] = useState("");
  const [passMark, setPassMark] = useState("35");

  return (
    <Modal title="Add assessment" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            subjectId,
            maxTheory: Number(maxTheory),
            maxPractical: maxPractical.trim() === "" ? null : Number(maxPractical),
            passMark: Number(passMark),
          });
        }}
        className="flex flex-col gap-3"
      >
        <label className={labelClass}>
          Subject
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className={inputClass}
            required
          >
            {subjects.length === 0 ? <option value="">No subjects left</option> : null}
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          <label className={labelClass}>
            Max theory
            <input
              type="number"
              min={0}
              value={maxTheory}
              onChange={(e) => setMaxTheory(e.target.value)}
              className={inputClass}
              required
            />
          </label>
          <label className={labelClass}>
            Max practical
            <input
              type="number"
              min={0}
              value={maxPractical}
              onChange={(e) => setMaxPractical(e.target.value)}
              className={inputClass}
              placeholder="none"
            />
          </label>
          <label className={labelClass}>
            Pass mark
            <input
              type="number"
              min={0}
              value={passMark}
              onChange={(e) => setPassMark(e.target.value)}
              className={inputClass}
              required
            />
          </label>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={subjectId === ""}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------- StartRegister */

function StartRegister({
  assessments,
  subjectName,
  disabled,
  onOpen,
}: {
  assessments: AssessmentDto[];
  subjectName: Map<string, string>;
  disabled: boolean;
  onOpen: (target: Target) => void;
}) {
  const [assessmentId, setAssessmentId] = useState("");
  const [sectionId, setSectionId] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
      <label className={labelClass}>
        Assessment
        <select
          value={assessmentId}
          onChange={(e) => setAssessmentId(e.target.value)}
          className={inputClass}
          disabled={disabled}
        >
          <option value="">Select…</option>
          {assessments.map((a) => (
            <option key={a.id} value={a.id}>
              {subjectName.get(a.subjectId) ?? a.subjectId}
            </option>
          ))}
        </select>
      </label>
      <SectionPicker onSection={setSectionId} />
      <Button
        variant="secondary"
        disabled={assessmentId === "" || sectionId === ""}
        onClick={() => onOpen({ assessmentId, sectionId })}
      >
        Open marks
      </Button>
    </div>
  );
}

/* ----------------------------------------------------------------- MarksGrid */

type Entry = { theory: string; practical: string; isAbsent: boolean };
const blank: Entry = { theory: "", practical: "", isAbsent: false };
const parseNum = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function MarksGrid({
  academicYearId,
  assessment,
  register,
  subjectLabel,
  target,
  onClose,
}: {
  academicYearId: string;
  assessment: AssessmentDto | null;
  register: ExamRegisterDto | null;
  subjectLabel: string | undefined;
  target: Target;
  onClose: () => void;
}) {
  const { show } = useToast();
  const utils = trpc.useUtils();
  const roster = trpc.enrollment.sectionRoster.useQuery({
    academicYearId,
    sectionId: target.sectionId,
  });
  const students = trpc.student.list.useQuery();
  const studentName = new Map(
    (students.data ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName}`]),
  );
  const existing = trpc.mark.listByRegister.useQuery(
    { examSectionId: register?.examSectionId ?? "" },
    { enabled: register?.examSectionId != null },
  );
  const existingByEnrollment = new Map((existing.data ?? []).map((m) => [m.enrollmentId, m]));

  const [edits, setEdits] = useState<Record<string, Entry>>({});

  const refresh = () => {
    void utils.exam.registers.invalidate();
    void utils.mark.listByRegister.invalidate();
  };
  const save = trpc.mark.save.useMutation({
    onSuccess: () => {
      setEdits({});
      refresh();
      show("success", "Marks saved");
    },
    onError: (e) => show("error", e.message),
  });
  const submit = trpc.mark.submit.useMutation({
    onSuccess: () => {
      refresh();
      show("success", "Register submitted");
    },
    onError: (e) => show("error", e.message),
  });
  const lock = trpc.mark.lock.useMutation({
    onSuccess: () => {
      refresh();
      show("success", "Register locked");
    },
    onError: (e) => show("error", e.message),
  });
  const unlock = trpc.mark.unlock.useMutation({
    onSuccess: () => {
      refresh();
      show("success", "Register unlocked");
    },
    onError: (e) => show("error", e.message),
  });

  const [unlocking, setUnlocking] = useState(false);

  const status = register?.status ?? "NONE";
  const editable = status === "NONE" || status === "DRAFT";
  const hasPractical = assessment?.maxPractical != null;
  const rows = roster.data ?? [];

  const current = (enrollmentId: string): Entry => {
    if (edits[enrollmentId]) return edits[enrollmentId];
    const m = existingByEnrollment.get(enrollmentId);
    if (!m) return blank;
    return {
      theory: m.theoryObtained != null ? String(m.theoryObtained) : "",
      practical: m.practicalObtained != null ? String(m.practicalObtained) : "",
      isAbsent: m.isAbsent,
    };
  };
  const setEntry = (enrollmentId: string, patch: Partial<Entry>) =>
    setEdits((prev) => ({ ...prev, [enrollmentId]: { ...current(enrollmentId), ...patch } }));

  if (assessment === null) return null;

  const exportCsv = () =>
    downloadCsv(
      `marks-${subjectLabel ?? "assessment"}-${register?.sectionName ?? target.sectionId}.csv`,
      [
        ["Student", "Roll no", "Theory", "Practical", "Total", "%", "Grade"],
        ...rows.map((e) => {
          const m = existingByEnrollment.get(e.id);
          const v = current(e.id);
          return [
            studentName.get(e.studentId) ?? e.studentId,
            e.rollNo == null ? "" : String(e.rollNo),
            v.isAbsent ? "AB" : v.theory,
            hasPractical ? (v.isAbsent ? "AB" : v.practical) : "",
            m?.totalObtained == null ? "" : String(m.totalObtained),
            m?.percentage == null ? "" : String(m.percentage),
            m?.gradeLetter ?? "",
          ];
        }),
      ],
    );

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">
            {subjectLabel ?? "Assessment"} · Section {register?.sectionName ?? "—"}
          </p>
          <p className="text-sm text-muted-foreground">
            {REGISTER_STATUS_LABEL[status]} · Max theory {assessment.maxTheory}
            {hasPractical ? ` · practical ${assessment.maxPractical}` : " · theory only"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCsv}>
            Export CSV
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <TableShell
        head={
          hasPractical
            ? ["Student", "Roll", "Theory", "Practical", "Total", "%", "Grade"]
            : ["Student", "Roll", "Theory", "Total", "%", "Grade"]
        }
        isLoading={roster.isLoading}
        isError={roster.isError}
        isEmpty={rows.length === 0}
        emptyText="No active students in this section."
      >
        {rows.map((e) => {
          const v = current(e.id);
          const m = existingByEnrollment.get(e.id);
          return (
            <tr key={e.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-2 font-medium text-foreground">
                {studentName.get(e.studentId) ?? e.studentId}
              </td>
              <td className="px-4 py-2 text-muted-foreground">{e.rollNo ?? "—"}</td>
              <td className="px-4 py-2">
                {editable ? (
                  <input
                    type="number"
                    min={0}
                    disabled={v.isAbsent}
                    value={v.theory}
                    onChange={(ev) => setEntry(e.id, { theory: ev.target.value })}
                    className={`${inputClass} w-20`}
                  />
                ) : (
                  <span className="text-muted-foreground">
                    {v.isAbsent ? "AB" : v.theory || "—"}
                  </span>
                )}
              </td>
              {hasPractical ? (
                <td className="px-4 py-2">
                  {editable ? (
                    <input
                      type="number"
                      min={0}
                      disabled={v.isAbsent}
                      value={v.practical}
                      onChange={(ev) => setEntry(e.id, { practical: ev.target.value })}
                      className={`${inputClass} w-20`}
                    />
                  ) : (
                    <span className="text-muted-foreground">
                      {v.isAbsent ? "AB" : v.practical || "—"}
                    </span>
                  )}
                </td>
              ) : null}
              <td className="px-4 py-2 text-muted-foreground">{m?.totalObtained ?? "—"}</td>
              <td className="px-4 py-2 text-muted-foreground">{m?.percentage ?? "—"}</td>
              <td className="px-4 py-2 text-muted-foreground">{m?.gradeLetter ?? "—"}</td>
            </tr>
          );
        })}
      </TableShell>

      {editable && rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                assessmentId: target.assessmentId,
                sectionId: target.sectionId,
                marks: rows.map((e) => {
                  const v = current(e.id);
                  return {
                    enrollmentId: e.id,
                    isAbsent: v.isAbsent,
                    theoryObtained: v.isAbsent ? null : parseNum(v.theory),
                    practicalObtained: v.isAbsent || !hasPractical ? null : parseNum(v.practical),
                  };
                }),
              })
            }
          >
            Save marks
          </Button>
          {register?.examSectionId != null && status === "DRAFT" ? (
            <Button
              variant="secondary"
              loading={submit.isPending}
              onClick={() => submit.mutate({ examSectionId: register.examSectionId })}
            >
              Submit
            </Button>
          ) : null}
        </div>
      ) : status === "SUBMITTED" && register ? (
        <div>
          <Button
            loading={lock.isPending}
            onClick={() => lock.mutate({ examSectionId: register.examSectionId })}
          >
            Lock register
          </Button>
        </div>
      ) : status === "LOCKED" && register ? (
        <div>
          <Button variant="secondary" onClick={() => setUnlocking(true)}>
            Unlock to edit
          </Button>
        </div>
      ) : null}

      {save.error ? <p className="text-sm text-destructive">{save.error.message}</p> : null}
      {submit.error ? <p className="text-sm text-destructive">{submit.error.message}</p> : null}
      {lock.error ? <p className="text-sm text-destructive">{lock.error.message}</p> : null}

      {unlocking && register ? (
        <UnlockModal
          busy={unlock.isPending}
          error={unlock.error?.message ?? null}
          onClose={() => setUnlocking(false)}
          onConfirm={(reason) =>
            unlock.mutate(
              { examSectionId: register.examSectionId, reason },
              { onSuccess: () => setUnlocking(false) },
            )
          }
        />
      ) : null}
    </div>
  );
}

function UnlockModal({
  busy,
  error,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="Unlock register" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(reason.trim());
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-sm text-muted-foreground">
          Unlocking reopens the register for edits and clears its result snapshot. The reason is
          audited.
        </p>
        <label className={labelClass}>
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            rows={3}
            required
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={reason.trim() === ""}>
            Unlock
          </Button>
        </div>
      </form>
    </Modal>
  );
}
