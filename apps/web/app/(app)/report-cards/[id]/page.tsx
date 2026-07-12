"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { PromotionDecisionKey, ReportCardDto } from "@repo/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { inputClass, labelClass, Modal, TableShell } from "@/src/components/academic/ui";
import { KIND_LABEL, sameScope } from "@/src/components/report-card/ui";
import { Button, PageHeader, StatusChip, useToast } from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/**
 * Report card detail (M7, ADR-014). Read-only snapshot + version history + the
 * role/status-aware lifecycle actions (admin: edit/approve/publish/reopen/revoke/
 * correct; class teacher: remark + submit while DRAFT). Thin transport — the service
 * enforces every permission, scope, and transition; this only hides buttons.
 */
export default function ReportCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = trpc.auth.me.useQuery();
  const card = trpc.reportCard.get.useQuery({ id }, { enabled: Boolean(id) });
  const history = trpc.reportCard.listForEnrollment.useQuery(
    { enrollmentId: card.data?.enrollmentId ?? "" },
    { enabled: card.data != null },
  );

  const { show } = useToast();
  const utils = trpc.useUtils();
  const onErr = (e: { message: string }) => show("error", e.message);
  const ok = (message: string) => ({ onSuccess: () => show("success", message), onError: onErr });
  const edit = trpc.reportCard.edit.useMutation(ok("Report card updated"));
  const draftRemark = trpc.reportCard.draftRemark.useMutation(ok("Remark saved"));
  const submit = trpc.reportCard.submit.useMutation(ok("Submitted for review"));
  const approve = trpc.reportCard.approve.useMutation(ok("Report card approved"));
  const publish = trpc.reportCard.publish.useMutation(ok("Report card published"));
  const reopen = trpc.reportCard.reopen.useMutation(ok("Report card reopened"));
  const revoke = trpc.reportCard.revoke.useMutation(ok("Report card revoked"));
  const correct = trpc.reportCard.correct.useMutation(ok("New version created"));

  const [editing, setEditing] = useState(false);
  const [remarking, setRemarking] = useState(false);
  const [reasonFor, setReasonFor] = useState<"reopen" | "revoke" | null>(null);

  if (me.isLoading || card.isLoading) {
    return <p className="p-6 text-muted-foreground">Loading…</p>;
  }
  if (card.isError || card.data == null) {
    return <p className="p-6 text-muted-foreground">This report card could not be loaded.</p>;
  }

  const c = card.data;
  const role = me.data?.role;
  const canManage = role !== undefined && can(role, PERMISSIONS.REPORT_CARD_MANAGE);
  const canRemark = role !== undefined && can(role, PERMISSIONS.REPORT_CARD_REMARK);

  const invalidate = () => {
    void utils.reportCard.get.invalidate({ id });
    void utils.reportCard.listForEnrollment.invalidate({ enrollmentId: c.enrollmentId });
  };
  const done = { onSuccess: invalidate };

  const versions = (history.data ?? [])
    .filter((v) => sameScope(v, c))
    .sort((a, b) => b.version - a.version);

  return (
    <section className="flex flex-col gap-5 p-6">
      <PageHeader
        title={`${KIND_LABEL[c.kind]} report card · v${c.version}`}
        breadcrumb={
          <Link href="/report-cards" className="text-primary-700 hover:underline">
            ← Report cards
          </Link>
        }
        action={<StatusChip status={c.status} />}
      />

      {/* actions */}
      <div className="flex flex-wrap gap-2">
        {canRemark && c.status === "DRAFT" ? (
          <>
            <Button variant="secondary" onClick={() => setRemarking(true)}>
              Edit teacher remark
            </Button>
            <Button
              loading={submit.isPending}
              onClick={() => submit.mutate({ reportCardId: c.id }, done)}
            >
              Submit for review
            </Button>
          </>
        ) : null}

        {canManage && c.status === "DRAFT" ? (
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <span className="self-center text-sm text-neutral-500">
              Awaiting class-teacher submission.
            </span>
          </>
        ) : null}
        {canManage && c.status === "SUBMITTED" ? (
          <>
            <Button
              loading={approve.isPending}
              onClick={() => approve.mutate({ reportCardId: c.id }, done)}
            >
              Approve
            </Button>
            <Button variant="secondary" onClick={() => setReasonFor("reopen")}>
              Reopen
            </Button>
          </>
        ) : null}
        {canManage && c.status === "APPROVED" ? (
          <>
            <Button
              loading={publish.isPending}
              onClick={() => publish.mutate({ reportCardId: c.id }, done)}
            >
              Publish
            </Button>
            <Button variant="secondary" onClick={() => setReasonFor("reopen")}>
              Reopen
            </Button>
          </>
        ) : null}
        {canManage && c.status === "PUBLISHED" ? (
          <>
            <Button
              loading={correct.isPending}
              onClick={() =>
                correct.mutate(
                  { reportCardId: c.id },
                  { onSuccess: (dto) => router.push(`/report-cards/${dto.id}`) },
                )
              }
            >
              Correct (new version)
            </Button>
            <Button variant="destructive" onClick={() => setReasonFor("revoke")}>
              Revoke
            </Button>
          </>
        ) : null}
      </div>
      {mutationError(edit, draftRemark, submit, approve, publish, reopen, revoke, correct)}

      {/* snapshot */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Rank">
          {c.rank != null && c.cohortSize != null ? `${c.rank} of ${c.cohortSize}` : "—"}
        </Stat>
        <Stat label="Attendance">
          {c.attendancePercentage != null ? `${c.attendancePercentage}%` : "—"}
        </Stat>
        <Stat label="GPA">{c.gpaSnapshot != null ? c.gpaSnapshot.toFixed(2) : "—"}</Stat>
        <Stat label="Result">{c.promotionDecision ?? "—"}</Stat>
      </div>

      <Remark
        label={
          c.classTeacherName
            ? `Class-teacher remark · ${c.classTeacherName}`
            : "Class-teacher remark"
        }
        body={c.classTeacherRemark}
      />
      <Remark label="Principal remark" body={c.principalRemark} />

      {/* version history — number + status only */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Version history</h2>
        <TableShell
          head={["Version", "Status"]}
          isLoading={history.isLoading}
          isError={history.isError}
          isEmpty={versions.length === 0}
          emptyText="No versions."
        >
          {versions.map((v) => (
            <tr key={v.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3 text-foreground">
                v{v.version}
                {v.id === c.id ? " (this)" : ""}
              </td>
              <td className="px-4 py-3">
                <StatusChip status={v.status} />
              </td>
            </tr>
          ))}
        </TableShell>
      </div>

      {editing ? (
        <AdminEditModal
          card={c}
          busy={edit.isPending}
          onClose={() => setEditing(false)}
          onSave={(data) =>
            edit.mutate(
              { reportCardId: c.id, ...data },
              {
                onSuccess: () => {
                  invalidate();
                  setEditing(false);
                },
              },
            )
          }
        />
      ) : null}
      {remarking ? (
        <RemarkModal
          current={c.classTeacherRemark}
          busy={draftRemark.isPending}
          onClose={() => setRemarking(false)}
          onSave={(remark) =>
            draftRemark.mutate(
              { reportCardId: c.id, remark },
              {
                onSuccess: () => {
                  invalidate();
                  setRemarking(false);
                },
              },
            )
          }
        />
      ) : null}
      {reasonFor ? (
        <ReasonModal
          action={reasonFor}
          busy={reasonFor === "reopen" ? reopen.isPending : revoke.isPending}
          onClose={() => setReasonFor(null)}
          onSubmit={(reason) => {
            const opts = {
              onSuccess: () => {
                invalidate();
                setReasonFor(null);
              },
            };
            if (reasonFor === "reopen") reopen.mutate({ reportCardId: c.id, reason }, opts);
            else revoke.mutate({ reportCardId: c.id, reason }, opts);
          }}
        />
      ) : null}
    </section>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{children}</p>
    </div>
  );
}

function Remark({ label, body }: { label: string; body: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{body ?? "—"}</p>
    </div>
  );
}

/** Surface the first pending mutation error (only one action runs at a time). */
function mutationError(...muts: { error: { message: string } | null }[]): ReactNode {
  const err = muts.find((m) => m.error != null)?.error;
  return err ? <p className="text-sm text-destructive">{err.message}</p> : null;
}

function AdminEditModal({
  card,
  busy,
  onClose,
  onSave,
}: {
  card: ReportCardDto;
  busy: boolean;
  onClose: () => void;
  onSave: (data: {
    principalRemark: string | null;
    promotionDecision: PromotionDecisionKey | null;
  }) => void;
}) {
  const [principalRemark, setPrincipalRemark] = useState(card.principalRemark ?? "");
  const [promotion, setPromotion] = useState<"" | PromotionDecisionKey>(
    card.promotionDecision ?? "",
  );
  return (
    <Modal title="Edit report card" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            principalRemark: principalRemark.trim() === "" ? null : principalRemark,
            promotionDecision: promotion === "" ? null : promotion,
          });
        }}
        className="flex flex-col gap-3"
      >
        <label className={labelClass}>
          Principal remark
          <textarea
            value={principalRemark}
            onChange={(e) => setPrincipalRemark(e.target.value)}
            className={`${inputClass} min-h-24`}
          />
        </label>
        <label className={labelClass}>
          Promotion decision
          <select
            value={promotion}
            onChange={(e) => setPromotion(e.target.value as "" | PromotionDecisionKey)}
            className={inputClass}
          >
            <option value="">Not set</option>
            <option value="PROMOTED">Promoted</option>
            <option value="RETAINED">Retained</option>
          </select>
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RemarkModal({
  current,
  busy,
  onClose,
  onSave,
}: {
  current: string | null;
  busy: boolean;
  onClose: () => void;
  onSave: (remark: string) => void;
}) {
  const [remark, setRemark] = useState(current ?? "");
  return (
    <Modal title="Class-teacher remark" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(remark);
        }}
        className="flex flex-col gap-3"
      >
        <label className={labelClass}>
          Remark
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            className={`${inputClass} min-h-24`}
            required
          />
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReasonModal({
  action,
  busy,
  onClose,
  onSubmit,
}: {
  action: "reopen" | "revoke";
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      title={action === "reopen" ? "Reopen report card" : "Revoke report card"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(reason);
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-sm text-muted-foreground">
          {action === "reopen"
            ? "Reopening returns the card to draft and clears its snapshot. A reason is required."
            : "Revoking removes a published card from parents. A reason is required."}
        </p>
        <label className={labelClass}>
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={`${inputClass} min-h-20`}
            required
          />
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={action === "revoke" ? "destructive" : "primary"}
            loading={busy}
          >
            {action === "reopen" ? "Reopen" : "Revoke"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
