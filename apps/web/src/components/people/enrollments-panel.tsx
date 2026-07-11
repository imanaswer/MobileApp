"use client";

import type { EnrollmentDto } from "@repo/types";
import { useState } from "react";

import {
  inputClass,
  labelClass,
  Modal,
  outlineBtn,
  primaryBtn,
  smallDangerBtn,
  smallGhostBtn,
  TableShell,
} from "@/src/components/academic/ui";
import { ConfirmAction } from "@/src/components/people/confirm";
import { trpc } from "@/src/trpc/react";

/**
 * Enrollment history + lifecycle actions for one student (ADR-010): enroll
 * creates the per-year row, transfer mutates section in place (same row),
 * promote/retain creates a NEW row for the target year, withdraw drops the row
 * and the student. Historical rows are never edited. All rules (one-per-year,
 * roll-no uniqueness, section∈class) are enforced in the service.
 */
export function EnrollmentsPanel({
  studentId,
  canManage,
  canReadAcademic,
}: {
  studentId: string;
  canManage: boolean;
  canReadAcademic: boolean;
}) {
  const enrollments = trpc.enrollment.listByStudent.useQuery({ studentId });
  const years = trpc.academicYear.list.useQuery(undefined, { enabled: canReadAcademic });
  const classes = trpc.class.list.useQuery(undefined, { enabled: canReadAcademic });

  const utils = trpc.useUtils();
  const invalidate = () => {
    void utils.enrollment.listByStudent.invalidate({ studentId });
    // withdraw also flips the student's status
    void utils.student.get.invalidate({ id: studentId });
    void utils.student.list.invalidate();
  };

  const enroll = trpc.enrollment.create.useMutation({ onSuccess: invalidate });
  const transfer = trpc.enrollment.transfer.useMutation({ onSuccess: invalidate });
  const promote = trpc.enrollment.promote.useMutation({ onSuccess: invalidate });
  const withdraw = trpc.enrollment.withdraw.useMutation({ onSuccess: invalidate });

  const [enrolling, setEnrolling] = useState(false);
  const [transferring, setTransferring] = useState<EnrollmentDto | null>(null);
  const [promoting, setPromoting] = useState<EnrollmentDto | null>(null);
  const [withdrawing, setWithdrawing] = useState<EnrollmentDto | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Enrollment history</h3>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              enroll.reset();
              setEnrolling(true);
            }}
            className={primaryBtn}
          >
            New enrollment
          </button>
        ) : null}
      </div>

      <TableShell
        head={["Academic year", "Class", "Section", "Roll no", "Status", "Actions"]}
        isLoading={enrollments.isLoading}
        isError={enrollments.isError}
        isEmpty={(enrollments.data ?? []).length === 0}
        emptyText="No enrollments yet."
      >
        {(enrollments.data ?? []).map((enrollment) => {
          const open = enrollment.status === "ACTIVE" || enrollment.status === "ADMITTED";
          return (
            <tr key={enrollment.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3 font-medium text-foreground">
                {enrollment.academicYearName}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{enrollment.className}</td>
              <td className="px-4 py-3 text-muted-foreground">{enrollment.sectionName ?? "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{enrollment.rollNo ?? "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{enrollment.status}</td>
              <td className="px-4 py-3">
                {canManage && open ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        transfer.reset();
                        setTransferring(enrollment);
                      }}
                      className={smallGhostBtn}
                    >
                      Transfer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        promote.reset();
                        setPromoting(enrollment);
                      }}
                      className={smallGhostBtn}
                    >
                      Promote
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        withdraw.reset();
                        setWithdrawing(enrollment);
                      }}
                      className={smallDangerBtn}
                    >
                      Withdraw
                    </button>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </TableShell>

      {enrolling ? (
        <EnrollModal
          title="New enrollment"
          yearOptions={years.data ?? []}
          classOptions={classes.data ?? []}
          busy={enroll.isPending}
          error={enroll.error?.message ?? null}
          onClose={() => setEnrolling(false)}
          onSubmit={(values) =>
            enroll.mutate(
              {
                studentId,
                academicYearId: values.academicYearId,
                classId: values.classId,
                ...(values.sectionId ? { sectionId: values.sectionId } : {}),
                ...(values.rollNo != null ? { rollNo: values.rollNo } : {}),
              },
              { onSuccess: () => setEnrolling(false) },
            )
          }
        />
      ) : null}

      {promoting !== null ? (
        <EnrollModal
          title="Promote / retain"
          yearOptions={(years.data ?? []).filter((y) => y.id !== promoting.academicYearId)}
          classOptions={classes.data ?? []}
          busy={promote.isPending}
          error={promote.error?.message ?? null}
          onClose={() => setPromoting(null)}
          onSubmit={(values) =>
            promote.mutate(
              {
                enrollmentId: promoting.id,
                targetAcademicYearId: values.academicYearId,
                toClassId: values.classId,
                ...(values.sectionId ? { toSectionId: values.sectionId } : {}),
                ...(values.rollNo != null ? { rollNo: values.rollNo } : {}),
              },
              { onSuccess: () => setPromoting(null) },
            )
          }
        />
      ) : null}

      {transferring !== null ? (
        <TransferModal
          enrollment={transferring}
          busy={transfer.isPending}
          error={transfer.error?.message ?? null}
          onClose={() => setTransferring(null)}
          onSubmit={(values) =>
            transfer.mutate(
              {
                enrollmentId: transferring.id,
                toSectionId: values.toSectionId,
                ...(values.rollNo != null ? { rollNo: values.rollNo } : {}),
              },
              { onSuccess: () => setTransferring(null) },
            )
          }
        />
      ) : null}

      {withdrawing !== null ? (
        <ConfirmAction
          title="Withdraw student"
          message="Withdraw this enrollment? The enrollment is marked DROPPED and the student becomes WITHDRAWN. History is kept."
          actionLabel="Withdraw"
          busyLabel="Withdrawing…"
          busy={withdraw.isPending}
          error={withdraw.error?.message ?? null}
          onCancel={() => setWithdrawing(null)}
          onConfirm={() =>
            withdraw.mutate(
              { enrollmentId: withdrawing.id },
              { onSuccess: () => setWithdrawing(null) },
            )
          }
        />
      ) : null}
    </section>
  );
}

interface PlacementValues {
  academicYearId: string;
  classId: string;
  sectionId: string;
  rollNo: number | undefined;
}

/** Year + class + optional section/roll picker (shared by enroll and promote). */
function EnrollModal({
  title,
  yearOptions,
  classOptions,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  yearOptions: readonly { id: string; name: string }[];
  classOptions: readonly { id: string; name: string }[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: PlacementValues) => void;
}) {
  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [rollNo, setRollNo] = useState("");
  const sections = trpc.section.list.useQuery({ classId }, { enabled: classId !== "" });

  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            academicYearId,
            classId,
            sectionId,
            rollNo: sectionId && rollNo ? Number(rollNo) : undefined,
          });
        }}
        className="flex flex-col gap-3"
      >
        <label className={labelClass}>
          Academic year
          <select
            value={academicYearId}
            onChange={(e) => setAcademicYearId(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Select a year…</option>
            {yearOptions.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Class
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
            }}
            className={inputClass}
            required
          >
            <option value="">Select a class…</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Section (optional — unplaced students are ADMITTED)
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className={inputClass}
            disabled={classId === ""}
          >
            <option value="">No section yet</option>
            {(sections.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Roll number (needs a section)
          <input
            type="number"
            min={1}
            value={rollNo}
            onChange={(e) => setRollNo(e.target.value)}
            className={inputClass}
            disabled={sectionId === ""}
          />
        </label>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={outlineBtn}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Section transfer WITHIN the same class (ADR-010 §5 — in-place, same row). */
function TransferModal({
  enrollment,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  enrollment: EnrollmentDto;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { toSectionId: string; rollNo: number | undefined }) => void;
}) {
  const [toSectionId, setToSectionId] = useState("");
  const [rollNo, setRollNo] = useState("");
  const sections = trpc.section.list.useQuery({ classId: enrollment.classId });
  const options = (sections.data ?? []).filter((s) => s.id !== enrollment.sectionId);

  return (
    <Modal title="Transfer section" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ toSectionId, rollNo: rollNo ? Number(rollNo) : undefined });
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-sm text-muted-foreground">
          Same class only — moving up a class is a promotion. The roll number is cleared unless a
          new one is set (roll numbers are per-section).
        </p>
        <label className={labelClass}>
          New section
          <select
            value={toSectionId}
            onChange={(e) => setToSectionId(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Select a section…</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          New roll number (optional)
          <input
            type="number"
            min={1}
            value={rollNo}
            onChange={(e) => setRollNo(e.target.value)}
            className={inputClass}
          />
        </label>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={outlineBtn}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Transferring…" : "Transfer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
