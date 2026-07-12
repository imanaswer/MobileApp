"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { ClassTeacherAssignmentDto } from "@repo/types";
import { useMemo, useState } from "react";

import {
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Select,
  TableToolbar,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/**
 * Class Teacher Management (M6.5, ADR-015). One class teacher per (year × section);
 * a replacement is an in-place update (never a second row). Teachers are referenced
 * by user id (no people directory / staff name exists — same convention as teacher
 * assignments). Management actions require ACADEMIC_MANAGE (enforced in the service);
 * the view requires ACADEMIC_READ (the section layout gate). There is no list
 * endpoint by design — the roster is one `classTeacher.get` per section.
 */
export default function ClassTeachersPage() {
  const { show } = useToast();
  const me = trpc.auth.me.useQuery();
  const canManage = me.data !== undefined && can(me.data.role, PERMISSIONS.ACADEMIC_MANAGE);

  const years = trpc.academicYear.list.useQuery();
  const classes = trpc.class.list.useQuery();
  const sectionLists = trpc.useQueries((t) =>
    (classes.data ?? []).map((item) => t.section.list({ classId: item.id })),
  );

  const activeYear = years.data?.find((y) => y.status === "ACTIVE");
  const [pickedYearId, setPickedYearId] = useState("");
  const yearId = pickedYearId || activeYear?.id || "";

  const className = useMemo(
    () => new Map((classes.data ?? []).map((c) => [c.id, c.name])),
    [classes.data],
  );
  const allSections = useMemo(
    () => sectionLists.flatMap((query) => query.data ?? []),
    [sectionLists],
  );
  const sectionLabel = (id: string, classId: string, name: string) =>
    `${className.get(classId) ?? ""} ${name}`.trim() || id;

  // No list endpoint (Get-only surface, ADR-015): the roster is one get per section.
  const classTeacherQueries = trpc.useQueries((t) =>
    yearId
      ? allSections.map((s) => t.classTeacher.get({ academicYearId: yearId, sectionId: s.id }))
      : [],
  );
  const bySection = new Map(allSections.map((s, i) => [s.id, classTeacherQueries[i]]));

  const utils = trpc.useUtils();
  const invalidate = () => utils.classTeacher.get.invalidate();
  const assign = trpc.classTeacher.assign.useMutation({
    onSuccess: () => {
      show("success", "Class teacher assigned");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const replace = trpc.classTeacher.replace.useMutation({
    onSuccess: () => {
      show("success", "Class teacher replaced");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.classTeacher.remove.useMutation({
    onSuccess: () => {
      show("success", "Class teacher removed");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  // Reuse the existing teacher directory for the picker (teacherProfile.list →
  // StaffDto{ userId, employeeId }; admins get the full list). No new API/logic.
  // Only fetched for managers, who are the only ones who see the assign form.
  const teachers = trpc.teacherProfile.list.useQuery(undefined, { enabled: canManage });
  const teacherOptions = useMemo(
    () =>
      (teachers.data ?? []).map((s) => ({ value: s.userId, label: `${s.name} · ${s.employeeId}` })),
    [teachers.data],
  );

  const [form, setForm] = useState<{
    mode: "assign" | "replace";
    sectionId: string;
    label: string;
    current: string | null;
  } | null>(null);
  const [removing, setRemoving] = useState<{
    dto: ClassTeacherAssignmentDto;
    label: string;
  } | null>(null);

  const sectionsLoading = classes.isLoading || sectionLists.some((q) => q.isLoading);

  const columns: Column<(typeof allSections)[number]>[] = [
    {
      key: "section",
      header: "Section",
      render: (section) => (
        <span className="font-medium text-neutral-800">
          {sectionLabel(section.id, section.classId, section.name)}
        </span>
      ),
    },
    {
      key: "teacher",
      header: "Class teacher",
      render: (section) => {
        const q = bySection.get(section.id);
        const dto = q?.data ?? null;
        if (!yearId) return <span className="text-neutral-500">—</span>;
        if (q?.isLoading) return <span className="text-neutral-500">…</span>;
        if (dto == null) return <span className="text-neutral-500">Not assigned</span>;
        return (
          <span className="text-neutral-800">
            {dto.teacherName}
            {dto.teacherId === me.data?.userId ? " (You)" : ""}
          </span>
        );
      },
    },
    {
      key: "since",
      header: "Since",
      render: (section) => {
        const dto = bySection.get(section.id)?.data ?? null;
        return (
          <span className="text-neutral-500">
            {dto ? new Date(dto.assignedAt).toLocaleDateString() : "—"}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (section) => {
        const dto = bySection.get(section.id)?.data ?? null;
        const label = sectionLabel(section.id, section.classId, section.name);
        if (!canManage || !yearId) return <span className="text-neutral-400">—</span>;
        if (dto == null) {
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                assign.reset();
                setForm({ mode: "assign", sectionId: section.id, label, current: null });
              }}
            >
              Assign
            </Button>
          );
        }
        return (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                replace.reset();
                setForm({ mode: "replace", sectionId: section.id, label, current: dto.teacherId });
              }}
            >
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-600 hover:bg-danger-50"
              onClick={() => {
                remove.reset();
                setRemoving({ dto, label });
              }}
            >
              Remove
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        rows={allSections}
        rowKey={(section) => section.id}
        loading={sectionsLoading || years.isLoading}
        error={classes.isError || years.isError}
        onRetry={() => {
          classes.refetch();
          years.refetch();
        }}
        toolbar={
          <TableToolbar
            filters={
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
            }
            actions={
              !canManage ? (
                <p className="text-sm text-neutral-500">
                  Read-only — you can’t manage class teachers.
                </p>
              ) : undefined
            }
          />
        }
        empty={<EmptyState title="No sections yet." />}
      />

      {form !== null ? (
        <ClassTeacherFormModal
          mode={form.mode}
          sectionLabel={form.label}
          teachers={teacherOptions}
          current={form.current}
          busy={form.mode === "assign" ? assign.isPending : replace.isPending}
          error={(form.mode === "assign" ? assign.error : replace.error)?.message ?? null}
          onClose={() => setForm(null)}
          onSubmit={(teacherId) => {
            const input = { academicYearId: yearId, sectionId: form.sectionId, teacherId };
            const opts = { onSuccess: () => setForm(null) };
            if (form.mode === "assign") assign.mutate(input, opts);
            else replace.mutate(input, opts);
          }}
        />
      ) : null}

      {removing !== null ? (
        <ConfirmDialog
          title="Remove class teacher"
          confirmLabel="Remove"
          message={`Remove the class teacher from ${removing.label}? This frees the slot; history stays in the audit log.`}
          busy={remove.isPending}
          error={remove.error?.message ?? null}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            remove.mutate({ id: removing.dto.id }, { onSuccess: () => setRemoving(null) })
          }
        />
      ) : null}
    </section>
  );
}

function ClassTeacherFormModal({
  mode,
  sectionLabel,
  teachers,
  current,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mode: "assign" | "replace";
  sectionLabel: string;
  teachers: readonly { value: string; label: string }[];
  current: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (teacherId: string) => void;
}) {
  const [teacherId, setTeacherId] = useState("");
  const currentLabel = teachers.find((t) => t.value === current)?.label ?? current;

  return (
    <Dialog
      title={`${mode === "assign" ? "Assign" : "Replace"} class teacher — ${sectionLabel}`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(teacherId);
        }}
        className="flex flex-col gap-4"
      >
        {mode === "replace" && current ? (
          <p className="text-sm text-neutral-500">
            Current class teacher: <span className="font-mono">{currentLabel}</span>. Replacing
            updates the slot in place (one row); the previous teacher is kept in the audit log.
          </p>
        ) : null}
        <Select
          label="Teacher"
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          helper="Staff are labelled by employee id (no name directory). Must be an ACTIVE user with the TEACHER role."
          required
        >
          <option value="">Select a teacher…</option>
          {teachers.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>

        {error ? <p className="text-sm text-danger-600">{error}</p> : null}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {mode === "assign" ? "Assign" : "Replace"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
