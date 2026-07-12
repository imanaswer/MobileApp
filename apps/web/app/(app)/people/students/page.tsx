"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { StudentDto, StudentStatusKey } from "@repo/types";
import { Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { Paginator, usePagedSearch } from "@/src/components/academic/ui";
import { StudentFormModal, type StudentFormValues } from "@/src/components/people/student-form";
import {
  Avatar,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  PageHeader,
  Select,
  SearchInput,
  StatusChip,
  TableToolbar,
  useToast,
  type Column,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

const STATUSES: readonly StudentStatusKey[] = ["ACTIVE", "ARCHIVED", "GRADUATED", "WITHDRAWN"];

/**
 * Students CRUD (identity only — placement lives on Enrollment, ADR-010).
 * Status filters server-side; search is client-side over the bounded list. Row
 * scope (teacher → own sections, parent → own children) is applied by the
 * service, so non-admins simply see a shorter list with no actions.
 */
export default function StudentsPage() {
  const me = trpc.auth.me.useQuery();
  const canManage = me.data !== undefined && can(me.data.role, PERMISSIONS.STUDENT_MANAGE);
  const { show } = useToast();

  const [status, setStatus] = useState<StudentStatusKey | "">("");
  const students = trpc.student.list.useQuery(status ? { status } : undefined);
  const utils = trpc.useUtils();
  const invalidate = () => utils.student.list.invalidate();

  const create = trpc.student.create.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Student created");
    },
    onError: (e) => show("error", e.message),
  });
  const update = trpc.student.update.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Student updated");
    },
    onError: (e) => show("error", e.message),
  });
  const archive = trpc.student.archive.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Student archived");
    },
    onError: (e) => show("error", e.message),
  });

  const [editing, setEditing] = useState<StudentDto | "new" | null>(null);
  const [archiving, setArchiving] = useState<StudentDto | null>(null);

  const paged = usePagedSearch(
    students.data,
    useCallback(
      (student: StudentDto, q: string) =>
        `${student.firstName} ${student.lastName}`.toLowerCase().includes(q) ||
        student.admissionNo.toLowerCase().includes(q),
      [],
    ),
  );

  const columns: Column<StudentDto>[] = [
    {
      key: "name",
      header: "Name",
      render: (s) => (
        <div className="flex items-center gap-3">
          <Avatar name={`${s.firstName} ${s.lastName}`} size="sm" />
          <Link
            href={`/people/students/${s.id}`}
            className="font-medium text-primary-700 hover:underline"
          >
            {s.firstName} {s.lastName}
          </Link>
        </div>
      ),
    },
    { key: "admissionNo", header: "Admission no", render: (s) => s.admissionNo },
    { key: "dob", header: "Date of birth", render: (s) => s.dob ?? "—" },
    { key: "status", header: "Status", render: (s) => <StatusChip status={s.status} /> },
    {
      key: "actions",
      header: "Actions",
      render: (s) =>
        canManage ? (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                create.reset();
                update.reset();
                setEditing(s);
              }}
            >
              Edit
            </Button>
            {s.status === "ACTIVE" ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger-600 hover:bg-danger-50"
                onClick={() => {
                  archive.reset();
                  setArchiving(s);
                }}
              >
                Archive
              </Button>
            ) : null}
          </div>
        ) : (
          <span className="text-neutral-500">—</span>
        ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Students"
        action={
          canManage ? (
            <Button
              icon={Users}
              onClick={() => {
                create.reset();
                update.reset();
                setEditing("new");
              }}
            >
              New student
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        rows={paged.pageItems}
        rowKey={(s) => s.id}
        loading={students.isLoading}
        error={students.isError}
        onRetry={() => void students.refetch()}
        empty={<EmptyState icon={Users} title="No students match." />}
        toolbar={
          <TableToolbar
            filters={
              <Select
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as StudentStatusKey | "")}
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            }
            search={
              <SearchInput
                value={paged.query}
                onChange={(e) => paged.setQuery(e.target.value)}
                aria-label="Search students"
              />
            }
          />
        }
        footer={
          <Paginator
            page={paged.page}
            pageCount={paged.pageCount}
            total={paged.total}
            onPage={paged.setPage}
          />
        }
      />

      {editing !== null ? (
        <StudentFormModal
          student={editing === "new" ? null : editing}
          busy={create.isPending || update.isPending}
          error={create.error?.message ?? update.error?.message ?? null}
          onClose={() => setEditing(null)}
          onSubmit={(values: StudentFormValues) => {
            const done = { onSuccess: () => setEditing(null) };
            if (editing === "new") {
              create.mutate(
                {
                  admissionNo: values.admissionNo,
                  firstName: values.firstName,
                  lastName: values.lastName,
                  ...(values.dob ? { dob: values.dob } : {}),
                  ...(values.gender ? { gender: values.gender } : {}),
                  ...(values.bloodGroup ? { bloodGroup: values.bloodGroup } : {}),
                  ...(values.nationality ? { nationality: values.nationality } : {}),
                  ...(values.aadhaar ? { aadhaar: values.aadhaar } : {}),
                  ...(values.passport ? { passport: values.passport } : {}),
                  ...(values.address ? { address: values.address } : {}),
                },
                done,
              );
            } else {
              update.mutate(
                {
                  id: editing.id,
                  firstName: values.firstName,
                  lastName: values.lastName,
                  dob: values.dob,
                  gender: values.gender,
                  bloodGroup: values.bloodGroup,
                  nationality: values.nationality,
                  aadhaar: values.aadhaar,
                  passport: values.passport,
                  address: values.address,
                },
                done,
              );
            }
          }}
        />
      ) : null}

      {archiving !== null ? (
        <ConfirmDialog
          title="Archive student"
          objectName={`${archiving.firstName} ${archiving.lastName}`}
          message="Archive this student? The record is kept (history is never deleted) but the student can no longer be enrolled:"
          confirmLabel="Archive"
          busy={archive.isPending}
          error={archive.error?.message ?? null}
          onCancel={() => setArchiving(null)}
          onConfirm={() =>
            archive.mutate({ id: archiving.id }, { onSuccess: () => setArchiving(null) })
          }
        />
      ) : null}
    </section>
  );
}
