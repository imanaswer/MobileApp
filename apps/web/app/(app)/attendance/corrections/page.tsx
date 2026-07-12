"use client";

import { FileEdit } from "lucide-react";

import { STATUS_LABEL } from "@/src/components/attendance/ui";
import {
  Button,
  type Column,
  DataTable,
  EmptyState,
  StatusChip,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/**
 * Correction approval queue (admin). Pending requests enriched with student name
 * + the record's date. Approve applies `requestedStatus` to the record in one
 * audited transaction (optimistic-guarded); reject leaves it untouched. The
 * record is never overwritten silently (ADR-011 §8).
 */
export default function CorrectionApprovalPage() {
  const { show } = useToast();
  const pending = trpc.attendanceCorrection.listPending.useQuery();
  const utils = trpc.useUtils();
  const decide = trpc.attendanceCorrection.decide.useMutation({
    onSuccess: (_data, variables) => {
      show(
        "success",
        variables.decision === "APPROVED" ? "Correction approved" : "Correction rejected",
      );
      return utils.attendanceCorrection.listPending.invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  const rows = pending.data ?? [];
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    {
      key: "student",
      header: "Student",
      render: (c) => <span className="font-medium text-neutral-800">{c.studentName}</span>,
    },
    {
      key: "date",
      header: "Date",
      render: (c) => <span className="text-neutral-500">{c.date}</span>,
    },
    {
      key: "change",
      header: "Change",
      render: (c) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusChip status={c.previousStatus} label={STATUS_LABEL[c.previousStatus]} />
          <span aria-hidden className="text-neutral-400">
            →
          </span>
          <StatusChip status={c.requestedStatus} label={STATUS_LABEL[c.requestedStatus]} />
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (c) => <span className="text-neutral-500">{c.reason}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (c) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ correctionId: c.id, decision: "APPROVED" })}
          >
            Approve
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger-600 hover:bg-danger-50"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ correctionId: c.id, decision: "REJECTED" })}
          >
            Reject
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-title text-neutral-800">Pending corrections</h2>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={pending.isLoading}
        error={pending.isError}
        onRetry={() => pending.refetch()}
        empty={<EmptyState icon={FileEdit} title="No pending corrections." />}
      />
    </section>
  );
}
