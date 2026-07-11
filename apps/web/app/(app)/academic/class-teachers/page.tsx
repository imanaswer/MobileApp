"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { ClassTeacherAssignmentDto } from "@repo/types";
import { useMemo, useState } from "react";

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
  const assign = trpc.classTeacher.assign.useMutation({ onSuccess: invalidate });
  const replace = trpc.classTeacher.replace.useMutation({ onSuccess: invalidate });
  const remove = trpc.classTeacher.remove.useMutation({ onSuccess: invalidate });

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

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
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
        {!canManage ? (
          <p className="text-sm text-muted-foreground">
            Read-only — you can’t manage class teachers.
          </p>
        ) : null}
      </div>

      <TableShell
        head={["Section", "Class teacher", "Since", "Actions"]}
        isLoading={sectionsLoading || years.isLoading}
        isError={classes.isError || years.isError}
        isEmpty={allSections.length === 0}
        emptyText="No sections yet."
      >
        {allSections.map((section) => {
          const q = bySection.get(section.id);
          const dto = q?.data ?? null;
          const label = sectionLabel(section.id, section.classId, section.name);
          return (
            <tr key={section.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3 font-medium text-foreground">{label}</td>
              <td className="px-4 py-3 text-foreground">
                {!yearId ? (
                  "—"
                ) : q?.isLoading ? (
                  "…"
                ) : dto == null ? (
                  <span className="text-muted-foreground">Not assigned</span>
                ) : (
                  `${dto.teacherName}${dto.teacherId === me.data?.userId ? " (You)" : ""}`
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {dto ? new Date(dto.assignedAt).toLocaleDateString() : "—"}
              </td>
              <td className="px-4 py-3">
                {!canManage || !yearId ? (
                  <span className="text-muted-foreground">—</span>
                ) : dto == null ? (
                  <button
                    type="button"
                    onClick={() => {
                      assign.reset();
                      setForm({ mode: "assign", sectionId: section.id, label, current: null });
                    }}
                    className={smallGhostBtn}
                  >
                    Assign
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        replace.reset();
                        setForm({
                          mode: "replace",
                          sectionId: section.id,
                          label,
                          current: dto.teacherId,
                        });
                      }}
                      className={smallGhostBtn}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        remove.reset();
                        setRemoving({ dto, label });
                      }}
                      className={smallDangerBtn}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </TableShell>

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
        <ConfirmDelete
          title="Remove class teacher"
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
    <Modal
      title={`${mode === "assign" ? "Assign" : "Replace"} class teacher — ${sectionLabel}`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(teacherId);
        }}
        className="flex flex-col gap-3"
      >
        {mode === "replace" && current ? (
          <p className="text-sm text-muted-foreground">
            Current class teacher: <span className="font-mono">{currentLabel}</span>. Replacing
            updates the slot in place (one row); the previous teacher is kept in the audit log.
          </p>
        ) : null}
        <label className={labelClass}>
          Teacher
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Select a teacher…</option>
            {teachers.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-muted-foreground">
            Staff are labelled by employee id (no name directory). Must be an ACTIVE user with the
            TEACHER role.
          </span>
        </label>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={outlineBtn}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Saving…" : mode === "assign" ? "Assign" : "Replace"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
