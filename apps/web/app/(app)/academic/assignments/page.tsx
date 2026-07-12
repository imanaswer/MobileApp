"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { TeacherAssignmentDto } from "@repo/types";
import { Plus, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  Select,
  TableToolbar,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/**
 * Teacher-assignments CRUD (assignments are immutable — create/delete only).
 * Filters are server-side (the list procedure accepts teacher/subject/section).
 * Teachers are referenced by user id: there is no people directory until M3,
 * and the M2 API surface is limited to the six academic routers by design.
 */
export default function TeacherAssignmentsPage() {
  const { show } = useToast();
  const me = trpc.auth.me.useQuery();
  const canManage = me.data !== undefined && can(me.data.role, PERMISSIONS.ACADEMIC_MANAGE);

  const subjects = trpc.subject.list.useQuery();
  const classes = trpc.class.list.useQuery();
  const sectionLists = trpc.useQueries((t) =>
    (classes.data ?? []).map((item) => t.section.list({ classId: item.id })),
  );

  const [filterSubjectId, setFilterSubjectId] = useState("");
  const [filterClassId, setFilterClassId] = useState("");
  const [filterSectionId, setFilterSectionId] = useState("");
  const [filterTeacherId, setFilterTeacherId] = useState("");

  const assignments = trpc.teacherAssignment.list.useQuery({
    ...(filterSubjectId ? { subjectId: filterSubjectId } : {}),
    ...(filterSectionId ? { sectionId: filterSectionId } : {}),
    ...(filterTeacherId.trim() ? { teacherId: filterTeacherId.trim() } : {}),
  });

  const utils = trpc.useUtils();
  const invalidate = () => utils.teacherAssignment.list.invalidate();
  const create = trpc.teacherAssignment.create.useMutation({
    onSuccess: () => {
      show("success", "Assignment created");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.teacherAssignment.delete.useMutation({
    onSuccess: () => {
      show("success", "Assignment removed");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TeacherAssignmentDto | null>(null);

  const subjectName = useMemo(
    () => new Map((subjects.data ?? []).map((s) => [s.id, s.name])),
    [subjects.data],
  );
  const className = useMemo(
    () => new Map((classes.data ?? []).map((c) => [c.id, c.name])),
    [classes.data],
  );
  const allSections = useMemo(
    () => sectionLists.flatMap((query) => query.data ?? []),
    [sectionLists],
  );
  const sectionLabel = useMemo(
    () =>
      new Map(allSections.map((s) => [s.id, `${className.get(s.classId) ?? ""} ${s.name}`.trim()])),
    [allSections, className],
  );

  const filterSections = filterClassId
    ? allSections.filter((s) => s.classId === filterClassId)
    : allSections;

  const rows = assignments.data ?? [];
  // Class is a client-side narrowing of the section filter (the API filters by section).
  const visibleRows = filterClassId
    ? rows.filter((row) => {
        const section = allSections.find((s) => s.id === row.sectionId);
        return section?.classId === filterClassId;
      })
    : rows;

  const columns: Column<TeacherAssignmentDto>[] = [
    {
      key: "teacher",
      header: "Teacher",
      render: (assignment) => (
        <span className="font-mono text-xs text-neutral-800">
          {assignment.teacherId === me.data?.userId ? "You" : assignment.teacherId}
        </span>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      render: (assignment) => (
        <span className="font-medium text-neutral-800">
          {subjectName.get(assignment.subjectId) ?? assignment.subjectId}
        </span>
      ),
    },
    {
      key: "section",
      header: "Section",
      render: (assignment) => (
        <span className="text-neutral-500">
          {sectionLabel.get(assignment.sectionId) ?? assignment.sectionId}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (assignment) =>
        canManage ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger-600 hover:bg-danger-50"
            onClick={() => {
              remove.reset();
              setDeleting(assignment);
            }}
          >
            Delete
          </Button>
        ) : (
          <span className="text-neutral-400">—</span>
        ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        rows={visibleRows}
        rowKey={(assignment) => assignment.id}
        loading={assignments.isLoading}
        error={assignments.isError}
        onRetry={() => assignments.refetch()}
        toolbar={
          <TableToolbar
            filters={
              <>
                <Select
                  label="Subject"
                  value={filterSubjectId}
                  onChange={(e) => setFilterSubjectId(e.target.value)}
                >
                  <option value="">All subjects</option>
                  {(subjects.data ?? []).map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Class"
                  value={filterClassId}
                  onChange={(e) => {
                    setFilterClassId(e.target.value);
                    setFilterSectionId("");
                  }}
                >
                  <option value="">All classes</option>
                  {(classes.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Section"
                  value={filterSectionId}
                  onChange={(e) => setFilterSectionId(e.target.value)}
                >
                  <option value="">All sections</option>
                  {filterSections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {sectionLabel.get(s.id) ?? s.name}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Teacher user id"
                  value={filterTeacherId}
                  onChange={(e) => setFilterTeacherId(e.target.value)}
                  placeholder="All teachers"
                />
              </>
            }
            actions={
              canManage ? (
                <Button
                  icon={Plus}
                  onClick={() => {
                    create.reset();
                    setCreating(true);
                  }}
                >
                  New assignment
                </Button>
              ) : undefined
            }
          />
        }
        empty={<EmptyState icon={UserCheck} title="No teacher assignments match." />}
      />

      {creating ? (
        <AssignmentFormModal
          subjects={(subjects.data ?? []).map((s) => ({ id: s.id, label: s.name }))}
          classes={(classes.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
          sectionsByClass={(classId) =>
            allSections
              .filter((s) => s.classId === classId)
              .map((s) => ({ id: s.id, label: s.name }))
          }
          busy={create.isPending}
          error={create.error?.message ?? null}
          onClose={() => setCreating(false)}
          onSubmit={(values) => create.mutate(values, { onSuccess: () => setCreating(false) })}
        />
      ) : null}

      {deleting !== null ? (
        <ConfirmDialog
          title="Delete assignment"
          message={`Permanently remove ${
            subjectName.get(deleting.subjectId) ?? "this subject"
          } for ${sectionLabel.get(deleting.sectionId) ?? "this section"} from this teacher?`}
          busy={remove.isPending}
          error={remove.error?.message ?? null}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })
          }
        />
      ) : null}
    </section>
  );
}

function AssignmentFormModal({
  subjects,
  classes,
  sectionsByClass,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  subjects: readonly { id: string; label: string }[];
  classes: readonly { id: string; label: string }[];
  sectionsByClass: (classId: string) => readonly { id: string; label: string }[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { teacherId: string; subjectId: string; sectionId: string }) => void;
}) {
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const sections = classId ? sectionsByClass(classId) : [];

  return (
    <Dialog title="New teacher assignment" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ teacherId: teacherId.trim(), subjectId, sectionId });
        }}
        className="flex flex-col gap-4"
      >
        <Input
          label="Teacher user id"
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          className="font-mono"
          placeholder="usr_…"
          helper="The teacher’s user id (a teacher directory arrives with M3 people records). The teacher must be an ACTIVE user with the TEACHER role."
          required
        />
        <Select
          label="Subject"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          required
        >
          <option value="">Select a subject…</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.label}
            </option>
          ))}
        </Select>
        <Select
          label="Class"
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setSectionId("");
          }}
          required
        >
          <option value="">Select a class…</option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </Select>
        <Select
          label="Section"
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          disabled={!classId}
          required
        >
          <option value="">Select a section…</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>

        {error ? <p className="text-sm text-danger-600">{error}</p> : null}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
