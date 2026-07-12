"use client";

import { CalendarClock } from "lucide-react";

import { Button, type Column, DataTable, EmptyState, useToast } from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/**
 * Leave approval queue (admin). Pending requests school-wide, enriched with the
 * child's name; approve/reject stamps the decision. Approval writes no attendance
 * — approved leave only biases the marking default (ADR-011 §7).
 */
export default function LeaveApprovalPage() {
  const { show } = useToast();
  const pending = trpc.leave.listPending.useQuery();
  const utils = trpc.useUtils();
  const decide = trpc.leave.decide.useMutation({
    onSuccess: (_data, variables) => {
      show("success", variables.decision === "APPROVED" ? "Leave approved" : "Leave rejected");
      return utils.leave.listPending.invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  const rows = pending.data ?? [];
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    {
      key: "student",
      header: "Student",
      render: (l) => <span className="font-medium text-neutral-800">{l.studentName}</span>,
    },
    {
      key: "from",
      header: "From",
      render: (l) => <span className="text-neutral-500">{l.fromDate}</span>,
    },
    {
      key: "to",
      header: "To",
      render: (l) => <span className="text-neutral-500">{l.toDate}</span>,
    },
    {
      key: "reason",
      header: "Reason",
      render: (l) => <span className="text-neutral-500">{l.reason}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (l) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ leaveId: l.id, decision: "APPROVED" })}
          >
            Approve
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger-600 hover:bg-danger-50"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ leaveId: l.id, decision: "REJECTED" })}
          >
            Reject
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-title text-neutral-800">Pending leave</h2>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        loading={pending.isLoading}
        error={pending.isError}
        onRetry={() => pending.refetch()}
        empty={<EmptyState icon={CalendarClock} title="No pending leave requests." />}
      />
    </section>
  );
}
