"use client";

import type { ExamDto, ExamTypeKey } from "@repo/types";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ConfirmDelete,
  inputClass,
  labelClass,
  Modal,
  outlineBtn,
  primaryBtn,
  smallDangerBtn,
  smallGhostBtn,
  TableShell,
} from "@/src/components/academic/ui";
import { EXAM_TYPE_LABEL, EXAM_TYPES } from "@/src/components/exam/ui";
import { trpc } from "@/src/trpc/react";

type ExamFormValues = {
  name: string;
  type: ExamTypeKey;
  startDate: string | null;
  endDate: string | null;
};

/**
 * Exam dashboard (M5, ADR-012). Lists a year's exams; create/edit/delete; publish
 * with the R3 locked-vs-total confirm (parents never see partial). Assessments +
 * the register lifecycle live on the exam detail page.
 */
export default function ExamsDashboardPage() {
  const years = trpc.academicYear.list.useQuery();
  const [yearId, setYearId] = useState("");
  // Default to the active year once loaded.
  useEffect(() => {
    if (yearId === "" && years.data) {
      const active = years.data.find((y) => y.status === "ACTIVE") ?? years.data[0];
      if (active) setYearId(active.id);
    }
  }, [years.data, yearId]);

  const exams = trpc.exam.list.useQuery({ academicYearId: yearId }, { enabled: yearId !== "" });
  const utils = trpc.useUtils();
  const invalidate = () => utils.exam.list.invalidate();

  const create = trpc.exam.create.useMutation({ onSuccess: invalidate });
  const update = trpc.exam.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.exam.delete.useMutation({ onSuccess: invalidate });

  const [editing, setEditing] = useState<ExamDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<ExamDto | null>(null);
  const [publishing, setPublishing] = useState<ExamDto | null>(null);

  const rows = [...(exams.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className={labelClass}>
          Academic year
          <select value={yearId} onChange={(e) => setYearId(e.target.value)} className={inputClass}>
            {(years.data ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.status === "ACTIVE" ? " (active)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={yearId === ""}
          onClick={() => {
            create.reset();
            update.reset();
            setEditing("new");
          }}
          className={primaryBtn}
        >
          New exam
        </button>
      </div>

      <TableShell
        head={["Name", "Type", "Dates", "Status", "Actions"]}
        isLoading={exams.isLoading}
        isError={exams.isError}
        isEmpty={rows.length === 0}
        emptyText="No exams for this year yet."
      >
        {rows.map((exam) => (
          <tr key={exam.id} className="border-b border-border last:border-b-0">
            <td className="px-4 py-3 font-medium text-foreground">
              <Link href={`/exams/${exam.id}`} className="text-primary hover:underline">
                {exam.name}
              </Link>
            </td>
            <td className="px-4 py-3 text-muted-foreground">{EXAM_TYPE_LABEL[exam.type]}</td>
            <td className="px-4 py-3 text-muted-foreground">
              {exam.startDate ?? "—"}
              {exam.endDate ? ` → ${exam.endDate}` : ""}
            </td>
            <td className="px-4 py-3">
              {exam.isPublished ? (
                <span className="font-medium text-foreground">Published</span>
              ) : (
                <span className="text-muted-foreground">Draft</span>
              )}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                {exam.isPublished ? null : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        create.reset();
                        update.reset();
                        setEditing(exam);
                      }}
                      className={smallGhostBtn}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        remove.reset();
                        setDeleting(exam);
                      }}
                      className={smallDangerBtn}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setPublishing(exam)}
                      className={smallGhostBtn}
                    >
                      Publish
                    </button>
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
      </TableShell>

      {editing !== null && yearId !== "" ? (
        <ExamFormModal
          exam={editing === "new" ? null : editing}
          busy={create.isPending || update.isPending}
          error={create.error?.message ?? update.error?.message ?? null}
          onClose={() => setEditing(null)}
          onSubmit={(values) => {
            const done = { onSuccess: () => setEditing(null) };
            if (editing === "new") {
              create.mutate(
                {
                  academicYearId: yearId,
                  name: values.name,
                  type: values.type,
                  ...(values.startDate ? { startDate: values.startDate } : {}),
                  ...(values.endDate ? { endDate: values.endDate } : {}),
                },
                done,
              );
            } else {
              update.mutate(
                {
                  examId: editing.id,
                  name: values.name,
                  type: values.type,
                  startDate: values.startDate,
                  endDate: values.endDate,
                },
                done,
              );
            }
          }}
        />
      ) : null}

      {deleting !== null ? (
        <ConfirmDelete
          title="Delete exam"
          message={`Permanently delete “${deleting.name}”? An exam with assessments or marks cannot be deleted.`}
          busy={remove.isPending}
          error={remove.error?.message ?? null}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate({ examId: deleting.id }, { onSuccess: () => setDeleting(null) })
          }
        />
      ) : null}

      {publishing !== null ? (
        <PublishModal
          exam={publishing}
          onClose={() => setPublishing(null)}
          onPublished={invalidate}
        />
      ) : null}
    </section>
  );
}

function ExamFormModal({
  exam,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  exam: ExamDto | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: ExamFormValues) => void;
}) {
  const [name, setName] = useState(exam?.name ?? "");
  const [type, setType] = useState<ExamTypeKey>(exam?.type ?? "UNIT_TEST");
  const [startDate, setStartDate] = useState(exam?.startDate ?? "");
  const [endDate, setEndDate] = useState(exam?.endDate ?? "");

  return (
    <Modal title={exam ? "Edit exam" : "New exam"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            name: name.trim(),
            type,
            startDate: startDate || null,
            endDate: endDate || null,
          });
        }}
        className="flex flex-col gap-3"
      >
        <label className={labelClass}>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Half Yearly Examination"
            required
          />
        </label>
        <label className={labelClass}>
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ExamTypeKey)}
            className={inputClass}
          >
            {EXAM_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXAM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          <label className={labelClass}>
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            End date
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

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

/**
 * Publish confirm — surfaces the R3 locked-vs-total count so publishing an
 * incomplete exam is an explicit choice (only LOCKED registers become visible to
 * parents; the rest stay hidden).
 */
function PublishModal({
  exam,
  onClose,
  onPublished,
}: {
  exam: ExamDto;
  onClose: () => void;
  onPublished: () => void;
}) {
  const registers = trpc.exam.registers.useQuery({ examId: exam.id });
  const publish = trpc.exam.publish.useMutation({
    onSuccess: () => {
      onPublished();
      onClose();
    },
  });

  const total = registers.data?.length ?? 0;
  const locked = (registers.data ?? []).filter((r) => r.status === "LOCKED").length;
  const unlocked = total - locked;

  return (
    <Modal title={`Publish “${exam.name}”`} onClose={onClose}>
      {registers.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading registers…</p>
      ) : total === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          No registers have been started — parents will see no marks for this exam. Publishing is
          permanent for this exam.
        </p>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">
          {locked} of {total} register{total === 1 ? "" : "s"} locked.{" "}
          {unlocked > 0
            ? `${unlocked} not yet locked won’t be visible to parents.`
            : "All locked registers become visible to parents."}{" "}
          Publishing is permanent for this exam.
        </p>
      )}
      {publish.error ? (
        <p className="mb-3 text-sm text-destructive">{publish.error.message}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={outlineBtn}>
          Cancel
        </button>
        <button
          type="button"
          disabled={publish.isPending || registers.isLoading}
          onClick={() => publish.mutate({ examId: exam.id })}
          className={primaryBtn}
        >
          {publish.isPending ? "Publishing…" : "Publish"}
        </button>
      </div>
    </Modal>
  );
}
