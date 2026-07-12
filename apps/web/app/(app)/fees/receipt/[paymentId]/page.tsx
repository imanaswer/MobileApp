"use client";

import { Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { formatPaise, METHOD_LABEL } from "@/src/components/fees/ui";
import { Button, Card, Skeleton } from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

const fmtDate = (s: string) => new Date(s).toLocaleDateString();

/**
 * Printable payment receipt (M13, ADR-021 Step 7 / §8) — rendered on demand from the
 * payment + invoice (no stored PDF). Scope-gated by the invoice read gate. "Print" uses
 * the browser's native print dialog (→ save as PDF).
 */
export default function ReceiptPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const receipt = trpc.payment.receipt.useQuery({ id: paymentId ?? "" }, { enabled: !!paymentId });
  const students = trpc.student.list.useQuery();
  const data = receipt.data;

  const studentName = useMemo(() => {
    const s = (students.data ?? []).find((x) => x.id === data?.invoice.studentId);
    return s ? `${s.firstName} ${s.lastName}` : null;
  }, [students.data, data?.invoice.studentId]);

  if (receipt.isLoading || !data) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  const { payment, invoice } = data;

  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="mb-4 flex justify-end print:hidden">
        <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>

      <Card>
        <div className="mb-4 border-b border-neutral-200 pb-4 text-center">
          <h1 className="text-title font-semibold text-neutral-900">Payment Receipt</h1>
          <p className="text-sm text-neutral-500">{payment.receiptNumber}</p>
        </div>

        <dl className="flex flex-col gap-2 text-sm">
          <Row label="Date" value={fmtDate(payment.paymentDate)} />
          {studentName ? <Row label="Student" value={studentName} /> : null}
          <Row label="Invoice" value={invoice.invoiceNumber} />
          <Row label="Method" value={METHOD_LABEL[payment.method]} />
          {payment.referenceNo ? <Row label="Reference" value={payment.referenceNo} /> : null}
          <div className="my-2 border-t border-neutral-200" />
          <Row label="Amount paid" value={formatPaise(payment.amount)} strong />
          <Row label="Invoice total" value={formatPaise(invoice.totalAmount)} />
          <Row label="Invoice balance" value={formatPaise(invoice.balanceAmount)} />
        </dl>

        {payment.remarks ? (
          <p className="mt-4 text-sm text-neutral-500">{payment.remarks}</p>
        ) : null}
      </Card>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd
        className={
          strong
            ? "text-base font-semibold tabular-nums text-neutral-900"
            : "tabular-nums text-neutral-800"
        }
      >
        {value}
      </dd>
    </div>
  );
}
