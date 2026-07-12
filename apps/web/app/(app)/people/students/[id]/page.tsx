"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { DocumentsPanel } from "@/src/components/people/documents-panel";
import { EnrollmentsPanel } from "@/src/components/people/enrollments-panel";
import { GuardiansPanel } from "@/src/components/people/guardians-panel";
import { StudentFormModal, type StudentFormValues } from "@/src/components/people/student-form";
import {
  Avatar,
  Button,
  Card,
  ErrorState,
  SkeletonText,
  StatusChip,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/**
 * Student detail: identity card (edit here), then the three ownership panels —
 * enrollment history (ADR-010 placement), guardians (StudentParent links), and
 * documents (private-bucket metadata). Action visibility follows the manage
 * permissions; the services stay authoritative.
 */
export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;
  const { show } = useToast();

  const me = trpc.auth.me.useQuery();
  const role = me.data?.role;
  const canManageStudent = role !== undefined && can(role, PERMISSIONS.STUDENT_MANAGE);
  const canManageEnrollment = role !== undefined && can(role, PERMISSIONS.ENROLLMENT_MANAGE);
  const canManageParents = role !== undefined && can(role, PERMISSIONS.PARENT_MANAGE);
  const canManageDocuments = role !== undefined && can(role, PERMISSIONS.STUDENT_DOCUMENT_MANAGE);
  const canReadAcademic = role !== undefined && can(role, PERMISSIONS.ACADEMIC_READ);
  const canReadParents = role !== undefined && can(role, PERMISSIONS.PARENT_READ);

  const student = trpc.student.get.useQuery({ id: studentId });
  const utils = trpc.useUtils();
  const update = trpc.student.update.useMutation({
    onSuccess: () => {
      void utils.student.get.invalidate({ id: studentId });
      void utils.student.list.invalidate();
      show("success", "Student details saved");
    },
    onError: (e) => show("error", e.message),
  });

  const [editing, setEditing] = useState(false);

  if (student.isError) {
    return (
      <section className="flex flex-col gap-3">
        <ErrorState message="Student not found, or you don’t have access." />
        <Link href="/people/students" className="text-sm text-primary-700 hover:underline">
          ← Back to students
        </Link>
      </section>
    );
  }

  const data = student.data;

  return (
    <section className="flex flex-col gap-6">
      <Link href="/people/students" className="text-caption text-neutral-500 hover:underline">
        ← Students
      </Link>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={data ? `${data.firstName} ${data.lastName}` : "Student"} size="lg" />
          <div className="flex flex-col gap-1">
            <h2 className="text-title font-semibold text-neutral-900">
              {data ? `${data.firstName} ${data.lastName}` : "Student"}
            </h2>
            {data ? (
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <span>Admission no {data.admissionNo}</span>
                <StatusChip status={data.status} />
              </div>
            ) : null}
          </div>
        </div>
        {canManageStudent && data ? (
          <Button
            onClick={() => {
              update.reset();
              setEditing(true);
            }}
          >
            Edit details
          </Button>
        ) : null}
      </Card>

      {data === undefined ? (
        <Card>
          <SkeletonText lines={4} />
        </Card>
      ) : (
        <Card>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <IdentityField label="Date of birth" value={data.dob} />
            <IdentityField label="Gender" value={data.gender} />
            <IdentityField label="Blood group" value={data.bloodGroup} />
            <IdentityField label="Nationality" value={data.nationality} />
            <IdentityField label="Aadhaar" value={data.aadhaar} />
            <IdentityField label="Passport" value={data.passport} />
            <div className="col-span-2 sm:col-span-3">
              <IdentityField label="Address" value={data.address} />
            </div>
          </dl>
        </Card>
      )}

      <EnrollmentsPanel
        studentId={studentId}
        canManage={canManageEnrollment}
        canReadAcademic={canReadAcademic}
      />
      <GuardiansPanel
        studentId={studentId}
        canManage={canManageParents}
        canReadParents={canReadParents}
      />
      <DocumentsPanel studentId={studentId} canManage={canManageDocuments} />

      {editing && data ? (
        <StudentFormModal
          student={data}
          busy={update.isPending}
          error={update.error?.message ?? null}
          onClose={() => setEditing(false)}
          onSubmit={(values: StudentFormValues) =>
            update.mutate(
              {
                id: data.id,
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
              { onSuccess: () => setEditing(false) },
            )
          }
        />
      ) : null}
    </section>
  );
}

function IdentityField({ label, value }: { label: string; value: ReactNode | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption font-medium text-neutral-500">{label}</dt>
      <dd className="text-sm text-neutral-800">{value ?? "—"}</dd>
    </div>
  );
}
