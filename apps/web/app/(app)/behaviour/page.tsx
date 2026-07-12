"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { BehaviourSeverityKey, BehaviourStatusKey } from "@repo/types";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { downloadCsv } from "@/src/components/attendance/ui";
import {
  Button,
  type Column,
  DataTable,
  EmptyState,
  PageHeader,
  Select,
  StatusChip,
  type Tone,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

const SEVERITIES: BehaviourSeverityKey[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES: BehaviourStatusKey[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const CATEGORY_LABEL: Record<string, string> = {
  DISCIPLINE: "Discipline",
  BULLYING: "Bullying",
  UNIFORM: "Uniform",
  HOMEWORK: "Homework",
  MISCONDUCT: "Misconduct",
  LATE: "Late",
  OTHER: "Other",
};
const STATUS_LABEL: Record<BehaviourStatusKey, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
// Severity isn't in the shared tone map (feedback.tsx) — differentiate inline.
const SEVERITY_TONE: Record<BehaviourSeverityKey, Tone> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

type BehaviourRow = {
  id: string;
  createdAt: string;
  studentId: string;
  teacherId: string;
  category: string;
  severity: BehaviourSeverityKey;
  status: BehaviourStatusKey;
  title: string;
  parentNotified: boolean;
};

/**
 * Behaviour console (M12, ADR-020 Step 7) — admin-only (behaviour:manage). School-wide
 * incidents filtered by student / teacher / severity / status, with resolve + close and
 * a CSV export of the current view. Thin client over the tRPC surface; the service gates.
 */
export default function BehaviourConsolePage() {
  const { show } = useToast();
  const me = trpc.auth.me.useQuery();
  const role = me.data?.role;
  const canManage = role !== undefined && can(role, PERMISSIONS.BEHAVIOUR_MANAGE);

  const [studentId, setStudentId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [severity, setSeverity] = useState<BehaviourSeverityKey | "">("");
  const [status, setStatus] = useState<BehaviourStatusKey | "">("");

  const students = trpc.student.list.useQuery(undefined, { enabled: canManage });
  const teachers = trpc.teacherProfile.list.useQuery(undefined, { enabled: canManage });

  const studentName = useMemo(
    () => new Map((students.data ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName}`])),
    [students.data],
  );
  // teacherId on an incident is a User id; StaffDto.userId maps it to a display name.
  const teacherName = useMemo(
    () => new Map((teachers.data ?? []).map((t) => [t.userId, t.name])),
    [teachers.data],
  );

  const utils = trpc.useUtils();
  const list = trpc.behaviour.list.useQuery(
    {
      ...(studentId ? { studentId } : {}),
      ...(teacherId ? { teacherId } : {}),
      ...(severity ? { severity } : {}),
      ...(status ? { status } : {}),
    },
    { enabled: canManage },
  );
  const rows = list.data ?? [];

  const refresh = () => void utils.behaviour.list.invalidate();
  const resolve = trpc.behaviour.resolve.useMutation({
    onSuccess: () => {
      refresh();
      show("success", "Incident resolved.");
    },
    onError: (e) => show("error", e.message),
  });
  const close = trpc.behaviour.close.useMutation({
    onSuccess: () => {
      refresh();
      show("success", "Incident closed.");
    },
    onError: (e) => show("error", e.message),
  });
  const busy = resolve.isPending || close.isPending;

  const exportCsv = () => {
    const header = [
      "Date",
      "Student",
      "Teacher",
      "Category",
      "Severity",
      "Status",
      "Title",
      "Parent notified",
    ];
    const body = rows.map((b) => [
      fmtDate(b.createdAt),
      studentName.get(b.studentId) ?? b.studentId,
      teacherName.get(b.teacherId) ?? b.teacherId,
      CATEGORY_LABEL[b.category] ?? b.category,
      b.severity,
      STATUS_LABEL[b.status],
      b.title,
      b.parentNotified ? "Yes" : "No",
    ]);
    downloadCsv("behaviour-incidents.csv", [header, ...body]);
  };

  const columns: Column<BehaviourRow>[] = [
    {
      key: "date",
      header: "Date",
      render: (b) => <span className="text-neutral-500">{fmtDate(b.createdAt)}</span>,
    },
    {
      key: "student",
      header: "Student",
      render: (b) => (
        <div>
          <div className="font-medium text-neutral-800">{studentName.get(b.studentId) ?? "—"}</div>
          <div className="text-caption text-neutral-500">{b.title}</div>
        </div>
      ),
    },
    {
      key: "teacher",
      header: "Teacher",
      render: (b) => (
        <span className="text-neutral-500">{teacherName.get(b.teacherId) ?? "—"}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (b) => (
        <span className="text-neutral-500">{CATEGORY_LABEL[b.category] ?? b.category}</span>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      render: (b) => <StatusChip status={b.severity} tone={SEVERITY_TONE[b.severity]} />,
    },
    {
      key: "status",
      header: "Status",
      render: (b) => <StatusChip status={b.status} label={STATUS_LABEL[b.status]} />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (b) =>
        b.status === "CLOSED" ? (
          <span className="text-caption text-neutral-500">Closed</span>
        ) : (
          <div className="flex gap-1">
            {b.status !== "RESOLVED" ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => resolve.mutate({ id: b.id })}
              >
                Resolve
              </Button>
            ) : null}
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => close.mutate({ id: b.id })}
            >
              Close
            </Button>
          </div>
        ),
    },
  ];

  if (!me.isLoading && !canManage) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-danger-600">You don’t have access to the behaviour console.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <PageHeader
        title="Behaviour & discipline"
        breadcrumb={
          <Link href="/dashboard" className="hover:text-neutral-800">
            ← Dashboard
          </Link>
        }
        action={
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Select label="Student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">All students</option>
          {(students.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName}
            </option>
          ))}
        </Select>
        <Select label="Teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">All teachers</option>
          {(teachers.data ?? []).map((t) => (
            <option key={t.id} value={t.userId}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select
          label="Severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as BehaviourSeverityKey | "")}
        >
          <option value="">Any severity</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as BehaviourStatusKey | "")}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </section>

      <DataTable<BehaviourRow>
        columns={columns}
        rows={rows}
        rowKey={(b) => b.id}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        empty={
          <EmptyState
            icon={ShieldAlert}
            title="No incidents"
            message="No incidents match these filters."
          />
        }
      />
    </main>
  );
}
