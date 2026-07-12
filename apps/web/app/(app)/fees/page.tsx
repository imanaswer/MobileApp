"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { InvoiceDto, PaymentMethodKey } from "@repo/types";
import { Download, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { downloadCsv } from "@/src/components/attendance/ui";
import {
  formatPaise,
  INVOICE_STATUS_FILTERS,
  INVOICE_STATUS_LABEL,
  METHOD_LABEL,
  PAYMENT_METHODS,
  type StoredInvoiceStatusKey,
} from "@/src/components/fees/ui";
import {
  Banner,
  Button,
  Card,
  DataTable,
  DateField,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  StatusChip,
  useToast,
  type Column,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

const fmtDate = (s: string) => new Date(s).toLocaleDateString();

/**
 * Fees console (M13, ADR-021 Step 7) — admin. Filter invoices by year / class / section /
 * structure / status; generate a section's invoices from a structure; issue, record
 * payments, cancel, print receipts; export the current view (student ledger / outstanding
 * report) to CSV. Thin client over the tRPC surface; the service is the authority.
 */
export default function FeesConsolePage() {
  const me = trpc.auth.me.useQuery();
  const role = me.data?.role;
  const canManage = role !== undefined && can(role, PERMISSIONS.FEE_MANAGE);
  const canRecord = role !== undefined && can(role, PERMISSIONS.PAYMENT_RECORD);
  const { show } = useToast();

  const [academicYearId, setYear] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [feeStructureId, setStructure] = useState("");
  const [status, setStatus] = useState<StoredInvoiceStatusKey | "">("");

  const years = trpc.academicYear.list.useQuery(undefined, { enabled: canManage });
  const classes = trpc.class.list.useQuery(undefined, { enabled: canManage });
  const sections = trpc.section.list.useQuery({ classId }, { enabled: canManage && !!classId });
  const structures = trpc.fee.listStructures.useQuery(academicYearId ? { academicYearId } : {}, {
    enabled: canManage,
  });
  const students = trpc.student.list.useQuery(undefined, { enabled: canManage });
  const studentName = useMemo(
    () => new Map((students.data ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName}`])),
    [students.data],
  );

  const utils = trpc.useUtils();
  const list = trpc.fee.listInvoices.useQuery(
    {
      ...(academicYearId ? { academicYearId } : {}),
      ...(sectionId ? { sectionId } : {}),
      ...(feeStructureId ? { feeStructureId } : {}),
      ...(status ? { status } : {}),
    },
    { enabled: canManage },
  );
  const rows = list.data ?? [];
  const outstanding = rows
    .filter((i) => i.status !== "CANCELLED")
    .reduce((sum, i) => sum + i.balanceAmount, 0);

  const refresh = () => void utils.fee.listInvoices.invalidate();
  const issue = trpc.fee.issueInvoice.useMutation({
    onSuccess: () => {
      refresh();
      show("success", "Invoice issued");
    },
    onError: (e) => show("error", e.message),
  });
  const cancel = trpc.fee.cancelInvoice.useMutation({
    onSuccess: () => {
      refresh();
      show("success", "Invoice cancelled");
    },
    onError: (e) => show("error", e.message),
  });
  const generate = trpc.fee.generateInvoices.useMutation({ onSuccess: refresh });

  const [payFor, setPayFor] = useState<InvoiceDto | null>(null);
  const [receiptsFor, setReceiptsFor] = useState<InvoiceDto | null>(null);
  const busy = issue.isPending || cancel.isPending;

  const [dueDate, setDueDate] = useState("");

  const exportCsv = () => {
    const header = ["Invoice", "Student", "Status", "Total", "Paid", "Balance", "Issue", "Due"];
    const body = rows.map((i) => [
      i.invoiceNumber,
      studentName.get(i.studentId) ?? i.studentId,
      INVOICE_STATUS_LABEL[i.status],
      (i.totalAmount / 100).toFixed(2),
      (i.paidAmount / 100).toFixed(2),
      (i.balanceAmount / 100).toFixed(2),
      i.issueDate,
      i.dueDate,
    ]);
    downloadCsv("invoices.csv", [header, ...body]);
  };

  if (!me.isLoading && !canManage) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Banner tone="danger">You don’t have access to the fees console.</Banner>
      </main>
    );
  }

  const columns: Column<InvoiceDto>[] = [
    {
      key: "invoice",
      header: "Invoice",
      render: (i) => <span className="font-medium text-neutral-800">{i.invoiceNumber}</span>,
    },
    { key: "student", header: "Student", render: (i) => studentName.get(i.studentId) ?? "—" },
    {
      key: "status",
      header: "Status",
      render: (i) => <StatusChip status={i.status} label={INVOICE_STATUS_LABEL[i.status]} />,
    },
    { key: "total", header: "Total", align: "right", render: (i) => formatPaise(i.totalAmount) },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      render: (i) => (
        <span className="font-medium text-neutral-800">{formatPaise(i.balanceAmount)}</span>
      ),
    },
    { key: "due", header: "Due", render: (i) => fmtDate(i.dueDate) },
    {
      key: "actions",
      header: "Actions",
      render: (i) => (
        <div className="flex flex-wrap gap-1">
          {i.status === "DRAFT" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => issue.mutate({ id: i.id })}
            >
              Issue
            </Button>
          ) : null}
          {canRecord &&
          (i.status === "ISSUED" || i.status === "PARTIAL" || i.status === "OVERDUE") ? (
            <Button variant="ghost" size="sm" onClick={() => setPayFor(i)}>
              Record payment
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setReceiptsFor(i)}>
            Receipts
          </Button>
          {i.paidAmount === 0 && (i.status === "DRAFT" || i.status === "ISSUED") ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-600 hover:bg-danger-50"
              disabled={busy}
              onClick={() => cancel.mutate({ id: i.id })}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <PageHeader
        title="Fees & payments"
        breadcrumb={
          <Link href="/dashboard" className="text-primary-700 hover:underline">
            ← Dashboard
          </Link>
        }
        action={
          <div className="flex gap-2">
            <Link
              href="/fees/structures"
              className="inline-flex h-11 items-center rounded-md border border-neutral-300 bg-white px-4 font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Fee structures
            </Link>
            <Button
              variant="secondary"
              icon={Download}
              onClick={exportCsv}
              disabled={rows.length === 0}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Generate */}
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-500">Generate invoices</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Select
            label="Structure"
            value={feeStructureId}
            onChange={(e) => setStructure(e.target.value)}
          >
            <option value="">Select…</option>
            {(structures.data ?? [])
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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
          >
            <option value="">Select…</option>
            {(classes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            label="Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            disabled={!classId}
          >
            <option value="">Select…</option>
            {(sections.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <DateField
            label="Due date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            disabled={!feeStructureId || !sectionId || !dueDate || generate.isPending}
            loading={generate.isPending}
            onClick={() => generate.mutate({ feeStructureId, sectionId, dueDate })}
          >
            Generate
          </Button>
          {generate.data ? (
            <span className="text-sm text-neutral-500">
              {generate.data.created} created, {generate.data.skipped} skipped (already billed).
            </span>
          ) : null}
          {generate.error ? (
            <span className="text-sm text-danger-600">{generate.error.message}</span>
          ) : null}
        </div>
      </Card>

      {/* Filters */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Select
          label="Academic year"
          value={academicYearId}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="">All years</option>
          {(years.data ?? []).map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
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
        >
          <option value="">All classes</option>
          {(classes.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          label="Section"
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          disabled={!classId}
        >
          <option value="">All sections</option>
          {(sections.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as StoredInvoiceStatusKey | "")}
        >
          <option value="">Any status</option>
          {INVOICE_STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {INVOICE_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </section>

      <p className="text-sm text-neutral-500">
        {rows.length} invoice{rows.length === 1 ? "" : "s"} · Outstanding{" "}
        <span className="font-semibold tabular-nums text-neutral-800">
          {formatPaise(outstanding)}
        </span>
      </p>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(i) => i.id}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        empty={<EmptyState icon={Wallet} title="No invoices match these filters." />}
      />

      {payFor ? (
        <PaymentModal
          invoice={payFor}
          onClose={() => setPayFor(null)}
          onDone={() => {
            setPayFor(null);
            refresh();
          }}
        />
      ) : null}

      {receiptsFor ? (
        <ReceiptsModal invoice={receiptsFor} onClose={() => setReceiptsFor(null)} />
      ) : null}
    </main>
  );
}

function PaymentModal({
  invoice,
  onClose,
  onDone,
}: {
  invoice: InvoiceDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const { show } = useToast();
  const [amount, setAmount] = useState((invoice.balanceAmount / 100).toString());
  const [method, setMethod] = useState<PaymentMethodKey>("CASH");
  const [referenceNo, setRef] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const record = trpc.payment.record.useMutation({
    onSuccess: () => {
      show("success", "Payment recorded");
      onDone();
    },
    onError: (e) => show("error", e.message),
  });

  const submit = () => {
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setLocalError("Enter a valid amount");
      return;
    }
    const paise = Math.round(rupees * 100);
    if (paise > invoice.balanceAmount) {
      setLocalError("Amount exceeds the outstanding balance");
      return;
    }
    setLocalError(null);
    record.mutate({
      invoiceId: invoice.id,
      amount: paise,
      method,
      ...(referenceNo.trim() ? { referenceNo: referenceNo.trim() } : {}),
    });
  };

  return (
    <Dialog title={`Record payment · ${invoice.invoiceNumber}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-neutral-500">Balance {formatPaise(invoice.balanceAmount)}</p>
        <Input
          label="Amount (₹)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Select
          label="Method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethodKey)}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </Select>
        <Input
          label="Reference no. (optional)"
          value={referenceNo}
          onChange={(e) => setRef(e.target.value)}
        />
        {(localError ?? record.error?.message) ? (
          <p className="text-sm text-danger-600">{localError ?? record.error?.message}</p>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" loading={record.isPending} onClick={submit}>
            Record
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ReceiptsModal({ invoice, onClose }: { invoice: InvoiceDto; onClose: () => void }) {
  const payments = trpc.payment.listByInvoice.useQuery({ id: invoice.id });
  const rows = payments.data ?? [];
  return (
    <Dialog title={`Receipts · ${invoice.invoiceNumber}`} onClose={onClose}>
      {payments.isLoading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-neutral-500">No payments recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 p-2"
            >
              <div>
                <div className="font-medium text-neutral-800">{p.receiptNumber}</div>
                <div className="text-caption text-neutral-500">
                  {fmtDate(p.paymentDate)} · {METHOD_LABEL[p.method]}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium tabular-nums text-neutral-800">
                  {formatPaise(p.amount)}
                </span>
                <Link
                  href={`/fees/receipt/${p.id}`}
                  className="rounded-md px-2 py-1 text-sm font-medium text-primary-700 hover:bg-primary-50"
                  target="_blank"
                >
                  Print
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
