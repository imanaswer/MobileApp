"use client";

import type { ExamDto, ExamTypeKey } from "@repo/types";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EXAM_TYPE_LABEL, EXAM_TYPES } from "@/src/components/exam/ui";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  Select,
  StatusChip,
  TableToolbar,
  PageHeader,
  useToast,
  type Column,
} from "@/src/components/ui";
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
  const { show } = useToast();
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

  const create = trpc.exam.create.useMutation({
    onSuccess: () => {
      void invalidate();
      show("success", "Exam created");
    },
    onError: (e) => show("error", e.message),
  });
  const update = trpc.exam.update.useMutation({
    onSuccess: () => {
      void invalidate();
      show("success", "Changes saved");
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.exam.delete.useMutation({
    onSuccess: () => {
      void invalidate();
      show("success", "Exam deleted");
    },
    onError: (e) => show("error", e.message),
  });

  const [editing, setEditing] = useState<ExamDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<ExamDto | null>(null);
  const [publishing, setPublishing] = useState<ExamDto | null>(null);

  const rows = [...(exams.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  const columns: Column<ExamDto>[] = [
    {
      key: "name",
      header: "Name",
      render: (exam) => (
        <Link href={`/exams/${exam.id}`} className="font-medium text-primary-700 hover:underline">
          {exam.name}
        </Link>
      ),
    },
    { key: "type", header: "Type", render: (exam) => EXAM_TYPE_LABEL[exam.type] },
    {
      key: "dates",
      header: "Dates",
      render: (exam) => (
        <span className="text-neutral-500">
          {exam.startDate ?? "—"}
          {exam.endDate ? ` → ${exam.endDate}` : ""}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (exam) => <StatusChip status={exam.isPublished ? "PUBLISHED" : "DRAFT"} />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (exam) =>
        exam.isPublished ? null : (
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                create.reset();
                update.reset();
                setEditing(exam);
              }}
            >
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                remove.reset();
                setDeleting(exam);
              }}
            >
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPublishing(exam)}>
              Publish
            </Button>
          </div>
        ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Exams"
        action={
          <Button
            icon={GraduationCap}
            disabled={yearId === ""}
            onClick={() => {
              create.reset();
              update.reset();
              setEditing("new");
            }}
          >
            New exam
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(exam) => exam.id}
        loading={exams.isLoading}
        error={exams.isError}
        onRetry={() => void exams.refetch()}
        toolbar={
          <TableToolbar
            filters={
              <Select
                label="Academic year"
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
              >
                {(years.data ?? []).map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                    {y.status === "ACTIVE" ? " (active)" : ""}
                  </option>
                ))}
              </Select>
            }
          />
        }
        empty={<EmptyState icon={GraduationCap} title="No exams for this year yet." />}
      />

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
        <ConfirmDialog
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
    <Dialog title={exam ? "Edit exam" : "New exam"} onClose={onClose}>
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
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Half Yearly Examination"
          required
        />
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as ExamTypeKey)}>
          {EXAM_TYPES.map((t) => (
            <option key={t} value={t}>
              {EXAM_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-3">
          <Input
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label="End date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-danger-600">{error}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
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
  const { show } = useToast();
  const registers = trpc.exam.registers.useQuery({ examId: exam.id });
  const publish = trpc.exam.publish.useMutation({
    onSuccess: () => {
      show("success", "Exam published");
      onPublished();
      onClose();
    },
    onError: (e) => show("error", e.message),
  });

  const total = registers.data?.length ?? 0;
  const locked = (registers.data ?? []).filter((r) => r.status === "LOCKED").length;
  const unlocked = total - locked;

  return (
    <Dialog title={`Publish “${exam.name}”`} onClose={onClose}>
      {registers.isLoading ? (
        <p className="text-sm text-neutral-500">Loading registers…</p>
      ) : total === 0 ? (
        <p className="mb-4 text-sm text-neutral-500">
          No registers have been started — parents will see no marks for this exam. Publishing is
          permanent for this exam.
        </p>
      ) : (
        <p className="mb-4 text-sm text-neutral-500">
          {locked} of {total} register{total === 1 ? "" : "s"} locked.{" "}
          {unlocked > 0
            ? `${unlocked} not yet locked won’t be visible to parents.`
            : "All locked registers become visible to parents."}{" "}
          Publishing is permanent for this exam.
        </p>
      )}
      {publish.error ? (
        <p className="mb-3 text-sm text-danger-600">{publish.error.message}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          loading={publish.isPending}
          disabled={registers.isLoading}
          onClick={() => publish.mutate({ examId: exam.id })}
        >
          Publish
        </Button>
      </div>
    </Dialog>
  );
}
