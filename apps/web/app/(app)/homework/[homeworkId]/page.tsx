"use client";

import type { HomeworkChildContextDto, HomeworkDto } from "@repo/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { downloadCsv } from "@/src/components/attendance/ui";
import {
  fileError,
  HW_STATUS_LABEL,
  kb,
  pushToSignedUrl,
  SUB_STATUS_LABEL,
} from "@/src/components/homework/ui";
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  PageHeader,
  Select,
  StatusChip,
  useToast,
  type Column,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/**
 * Homework detail (M6, ADR-013), role-aware. Teacher/admin: edit + lifecycle
 * (publish/close/reopen/delete), teacher file upload/download (DRAFT-only), and the
 * submission review table (return/accept + feedback, CSV export). Parent: read the
 * assignment + teacher files, and submit/resubmit per child WITH file upload + note,
 * reading feedback. Uploads mint a signed URL, push bytes, then persist metadata.
 */
export default function HomeworkDetailPage() {
  const homeworkId = String(useParams().homeworkId ?? "");
  const me = trpc.auth.me.useQuery();
  const isParent = me.data?.role === "PARENT";

  const hw = trpc.homework.get.useQuery({ homeworkId }, { enabled: homeworkId !== "" });

  if (hw.isLoading) {
    return <p className="text-neutral-500">Loading…</p>;
  }
  if (hw.data === undefined) {
    return (
      <section className="flex flex-col gap-3">
        <Link href="/homework" className="text-sm text-primary-700 hover:underline">
          ← All homework
        </Link>
        <p className="text-neutral-500">Homework not found.</p>
      </section>
    );
  }
  const h = hw.data;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <PageHeader
          title={h.title}
          breadcrumb={
            <Link href="/homework" className="text-primary-700 hover:underline">
              ← All homework
            </Link>
          }
          action={<StatusChip status={h.status} label={HW_STATUS_LABEL[h.status]} />}
        />
        <p className="text-sm text-neutral-500">Due {h.dueDate}</p>
        {h.description ? <p className="text-neutral-800">{h.description}</p> : null}
      </div>

      <TeacherFiles homeworkId={homeworkId} status={h.status} canManage={!isParent} />

      {isParent ? (
        <ParentSubmissions homeworkId={homeworkId} canSubmit={h.status === "PUBLISHED"} />
      ) : (
        <>
          <Lifecycle homework={h} onChanged={() => void hw.refetch()} />
          <SubmissionsTable homeworkId={homeworkId} homework={h} />
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- teacher files */

function TeacherFiles({
  homeworkId,
  status,
  canManage,
}: {
  homeworkId: string;
  status: string;
  canManage: boolean;
}) {
  const { show } = useToast();
  const utils = trpc.useUtils();
  const files = trpc.homework.attachments.useQuery({ homeworkId });
  const invalidate = () => void utils.homework.attachments.invalidate({ homeworkId });

  const mintUpload = trpc.homework.attachmentUploadUrl.useMutation();
  const add = trpc.homework.attachmentAdd.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "File added");
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.homework.attachmentRemove.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "File removed");
    },
    onError: (e) => show("error", e.message),
  });
  const mintDownload = trpc.homework.attachmentDownloadUrl.useMutation();
  const [error, setError] = useState<string | null>(null);
  const editable = canManage && status === "DRAFT";

  async function onPick(file: File) {
    setError(null);
    const bad = fileError(file);
    if (bad) {
      setError(bad);
      return;
    }
    try {
      const minted = await mintUpload.mutateAsync({
        homeworkId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      await pushToSignedUrl(minted.storagePath, minted.token, file);
      await add.mutateAsync({
        homeworkId,
        storagePath: minted.storagePath,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-title text-neutral-800">Teacher files</h3>
      {(files.data ?? []).length === 0 ? (
        <p className="text-sm text-neutral-500">No files attached.</p>
      ) : (
        (files.data ?? []).map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2"
          >
            <span className="text-neutral-800">
              📎 {a.fileName} <span className="text-neutral-500">· {kb(a.sizeBytes)}</span>
            </span>
            <div className="flex gap-1">
              <FileOpenButton onOpen={() => mintDownload.mutateAsync({ attachmentId: a.id })} />
              {editable ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => remove.mutate({ attachmentId: a.id })}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        ))
      )}
      {editable ? (
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 self-start rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
          {mintUpload.isPending || add.isPending ? "Uploading…" : "Add file"}
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
              e.target.value = "";
            }}
          />
        </label>
      ) : null}
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- lifecycle */

function Lifecycle({ homework, onChanged }: { homework: HomeworkDto; onChanged: () => void }) {
  const { show } = useToast();
  const utils = trpc.useUtils();
  const done = () => {
    onChanged();
    void utils.homework.list.invalidate();
  };
  const publish = trpc.homework.publish.useMutation({
    onSuccess: () => {
      done();
      show("success", "Homework published");
    },
    onError: (e) => show("error", e.message),
  });
  const close = trpc.homework.close.useMutation({
    onSuccess: () => {
      done();
      show("success", "Homework closed");
    },
    onError: (e) => show("error", e.message),
  });
  const reopen = trpc.homework.reopen.useMutation({
    onSuccess: () => {
      done();
      show("success", "Homework reopened");
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.homework.delete.useMutation({
    onSuccess: () => {
      done();
      show("success", "Draft deleted");
    },
    onError: (e) => show("error", e.message),
  });
  const [reopening, setReopening] = useState(false);
  const err = publish.error ?? close.error ?? reopen.error ?? remove.error;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-title text-neutral-800">Lifecycle</h3>
      <div className="flex flex-wrap gap-2">
        {homework.status === "DRAFT" ? (
          <>
            <Button onClick={() => publish.mutate({ homeworkId: homework.id })}>Publish</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => remove.mutate({ homeworkId: homework.id })}
            >
              Delete draft
            </Button>
          </>
        ) : null}
        {homework.status === "PUBLISHED" ? (
          <Button variant="secondary" onClick={() => close.mutate({ homeworkId: homework.id })}>
            Close
          </Button>
        ) : null}
        {homework.status === "CLOSED" ? (
          <Button variant="secondary" onClick={() => setReopening(true)}>
            Reopen
          </Button>
        ) : null}
      </div>
      {err ? <p className="text-sm text-danger-600">{err.message}</p> : null}
      {reopening ? (
        <ReasonModal
          title="Reopen homework"
          hint="Reopening moves it back to Published so parents can submit again. The reason is audited."
          busy={reopen.isPending}
          error={reopen.error?.message ?? null}
          onClose={() => setReopening(false)}
          onConfirm={(reason) =>
            reopen.mutate(
              { homeworkId: homework.id, reason },
              { onSuccess: () => setReopening(false) },
            )
          }
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------- submissions table */

function SubmissionsTable({ homeworkId, homework }: { homeworkId: string; homework: HomeworkDto }) {
  const subs = trpc.submission.listByHomework.useQuery({ homeworkId });
  const roster = trpc.enrollment.sectionRoster.useQuery({
    academicYearId: homework.academicYearId,
    sectionId: homework.sectionId,
  });
  const students = trpc.student.list.useQuery();
  const studentName = new Map(
    (students.data ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName}`]),
  );
  const enrollmentStudent = new Map((roster.data ?? []).map((e) => [e.id, e.studentId]));
  const nameOf = (enrollmentId: string): string => {
    const sid = enrollmentStudent.get(enrollmentId);
    return (sid ? studentName.get(sid) : undefined) ?? "Student";
  };
  const [reviewing, setReviewing] = useState<string | null>(null);
  const rows = subs.data ?? [];

  const exportCsv = () =>
    downloadCsv(`submissions-${homework.title}.csv`, [
      ["Student", "Attempt", "Status", "Late", "Submitted"],
      ...rows.map((s) => [
        nameOf(s.enrollmentId),
        String(s.attempt),
        SUB_STATUS_LABEL[s.status],
        s.isLate ? "Yes" : "No",
        s.submittedAt,
      ]),
    ]);

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: "student",
      header: "Student",
      render: (s) => <span className="font-medium text-neutral-800">{nameOf(s.enrollmentId)}</span>,
    },
    { key: "attempt", header: "Attempt", align: "right", render: (s) => s.attempt },
    {
      key: "status",
      header: "Status",
      render: (s) => <StatusChip status={s.status} label={SUB_STATUS_LABEL[s.status]} />,
    },
    { key: "late", header: "Late", render: (s) => (s.isLate ? "Yes" : "No") },
    {
      key: "action",
      header: "",
      render: (s) => (
        <Button variant="ghost" size="sm" onClick={() => setReviewing(s.id)}>
          {s.status === "SUBMITTED" ? "Review" : "View"}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-title text-neutral-800">Submissions</h3>
        {rows.length > 0 ? (
          <Button variant="secondary" onClick={exportCsv}>
            Export CSV
          </Button>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={subs.isLoading}
        error={subs.isError}
        onRetry={() => void subs.refetch()}
        empty={<EmptyState title="No submissions yet." />}
      />
      {reviewing ? (
        <SubmissionModal submissionId={reviewing} onClose={() => setReviewing(null)} />
      ) : null}
    </div>
  );
}

/** Teacher submission view + review (files, feedback history, return/accept). */
function SubmissionModal({ submissionId, onClose }: { submissionId: string; onClose: () => void }) {
  const { show } = useToast();
  const utils = trpc.useUtils();
  const sub = trpc.submission.get.useQuery({ submissionId });
  const files = trpc.submission.attachments.useQuery({ submissionId });
  const feedback = trpc.submission.feedback.useQuery({ submissionId });
  const mintDownload = trpc.submission.attachmentDownloadUrl.useMutation();
  const review = trpc.submission.review.useMutation({
    onSuccess: () => {
      void utils.submission.get.invalidate({ submissionId });
      void utils.submission.feedback.invalidate({ submissionId });
      void utils.submission.listByHomework.invalidate();
      show("success", "Review submitted");
    },
    onError: (e) => show("error", e.message),
  });
  const [decision, setDecision] = useState<"RETURNED" | "REVIEWED">("RETURNED");
  const [body, setBody] = useState("");
  const s = sub.data;
  const canReview = s?.status === "SUBMITTED";

  return (
    <Dialog title="Submission" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {s ? (
          <p className="text-sm text-neutral-500">
            Attempt {s.attempt} · {SUB_STATUS_LABEL[s.status]}
            {s.isLate ? " · Late" : ""}
          </p>
        ) : null}
        {s?.note ? <p className="text-neutral-800">{s.note}</p> : null}

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-neutral-500">Files</p>
          {(files.data ?? []).length === 0 ? (
            <p className="text-sm text-neutral-500">No files.</p>
          ) : (
            (files.data ?? []).map((a) => (
              <div key={a.id} className="flex items-center justify-between">
                <span className="text-neutral-800">
                  📎 {a.fileName} <span className="text-neutral-500">(att. {a.attempt})</span>
                </span>
                <FileOpenButton onOpen={() => mintDownload.mutateAsync({ attachmentId: a.id })} />
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-neutral-500">Feedback</p>
          {(feedback.data ?? []).length === 0 ? (
            <p className="text-sm text-neutral-500">No feedback yet.</p>
          ) : (
            (feedback.data ?? []).map((f) => (
              <div key={f.id} className="rounded-md border border-neutral-200 p-2">
                <p className="text-caption text-neutral-500">
                  Attempt {f.attempt} · {SUB_STATUS_LABEL[f.decision]}
                </p>
                <p className="text-neutral-800">{f.body}</p>
              </div>
            ))
          )}
        </div>

        {canReview ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              review.mutate({ submissionId, decision, body: body.trim() });
            }}
            className="flex flex-col gap-2"
          >
            <Select
              label="Decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value as "RETURNED" | "REVIEWED")}
            >
              <option value="RETURNED">Request changes (parent may resubmit)</option>
              <option value="REVIEWED">Accept (final)</option>
            </Select>
            <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
              Feedback
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-body text-neutral-800 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600"
                rows={3}
                required
              />
            </label>
            {review.error ? (
              <p className="text-sm text-danger-600">{review.error.message}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button type="submit" loading={review.isPending} disabled={body.trim() === ""}>
                Submit review
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ----------------------------------------------------------- parent submissions */

function ParentSubmissions({ homeworkId, canSubmit }: { homeworkId: string; canSubmit: boolean }) {
  const ctxQuery = trpc.submission.childContext.useQuery({ homeworkId });
  const rows = ctxQuery.data ?? [];
  if (ctxQuery.isLoading) {
    return <p className="text-neutral-500">Loading…</p>;
  }
  if (rows.length === 0) {
    return <p className="text-neutral-500">This homework isn’t for your children.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-title text-neutral-800">Your children</h3>
      {rows.map((row) => (
        <ChildSubmission
          key={row.studentId}
          homeworkId={homeworkId}
          row={row}
          canSubmit={canSubmit}
        />
      ))}
    </div>
  );
}

function ChildSubmission({
  homeworkId,
  row,
  canSubmit,
}: {
  homeworkId: string;
  row: HomeworkChildContextDto;
  canSubmit: boolean;
}) {
  const { show } = useToast();
  const utils = trpc.useUtils();
  const sub = row.submission;
  const isResubmit = sub !== null;
  const reviewed = sub?.status === "REVIEWED";
  const nextAttempt = (sub?.attempt ?? 0) + 1;

  const files = trpc.submission.attachments.useQuery(
    { submissionId: sub?.id ?? "" },
    { enabled: sub !== null },
  );
  const feedback = trpc.submission.feedback.useQuery(
    { submissionId: sub?.id ?? "" },
    { enabled: sub !== null },
  );
  const mintDownload = trpc.submission.attachmentDownloadUrl.useMutation();
  const mintUpload = trpc.submission.attachmentUploadUrl.useMutation();
  const submit = trpc.submission.submit.useMutation();
  const resubmit = trpc.submission.resubmit.useMutation();

  const [note, setNote] = useState("");
  const [staged, setStaged] = useState<
    { storagePath: string; fileName: string; mimeType: string; sizeBytes: number }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionable = canSubmit && row.enrollmentId !== null && !reviewed;

  async function onPick(file: File) {
    setError(null);
    const bad = fileError(file);
    if (bad) {
      setError(bad);
      return;
    }
    try {
      setBusy(true);
      const minted = await mintUpload.mutateAsync({
        homeworkId,
        enrollmentId: row.enrollmentId!,
        attempt: nextAttempt,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      await pushToSignedUrl(minted.storagePath, minted.token, file);
      setStaged((prev) => [
        ...prev,
        {
          storagePath: minted.storagePath,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function onSend() {
    setError(null);
    const input = {
      homeworkId,
      enrollmentId: row.enrollmentId!,
      note: note.trim() === "" ? null : note.trim(),
      attachments: staged,
    };
    const opts = {
      onSuccess: () => {
        setNote("");
        setStaged([]);
        void utils.submission.childContext.invalidate({ homeworkId });
        show("success", isResubmit ? "Resubmitted" : "Submitted");
      },
      onError: (e: { message: string }) => setError(e.message),
    };
    if (isResubmit) resubmit.mutate(input, opts);
    else submit.mutate(input, opts);
  }

  const sending = submit.isPending || resubmit.isPending;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-neutral-800">{row.studentName}</p>
        {sub ? (
          <span className="text-sm text-neutral-500">
            Attempt {sub.attempt} · {SUB_STATUS_LABEL[sub.status]}
            {sub.isLate ? " · Late" : ""}
          </span>
        ) : (
          <span className="text-sm text-neutral-500">Not submitted</span>
        )}
      </div>

      {sub && (files.data ?? []).length > 0 ? (
        <div className="flex flex-col gap-1">
          {(files.data ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between">
              <span className="text-neutral-800">📎 {a.fileName}</span>
              <FileOpenButton onOpen={() => mintDownload.mutateAsync({ attachmentId: a.id })} />
            </div>
          ))}
        </div>
      ) : null}

      {sub && (feedback.data ?? []).length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-neutral-500">Feedback</p>
          {(feedback.data ?? []).map((f) => (
            <div key={f.id} className="rounded-md border border-neutral-200 p-2">
              <p className="text-caption text-neutral-500">
                Attempt {f.attempt} · {SUB_STATUS_LABEL[f.decision]}
              </p>
              <p className="text-neutral-800">{f.body}</p>
            </div>
          ))}
        </div>
      ) : null}

      {actionable ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
            Note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-body text-neutral-800 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600"
              rows={2}
            />
          </label>
          {staged.length > 0 ? (
            <ul className="text-sm text-neutral-500">
              {staged.map((f) => (
                <li key={f.storagePath}>📎 {f.fileName}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
              {busy ? "Uploading…" : "Attach file"}
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPick(f);
                  e.target.value = "";
                }}
              />
            </label>
            <Button
              type="button"
              loading={sending}
              disabled={busy || (note.trim() === "" && staged.length === 0)}
              onClick={onSend}
            >
              {isResubmit ? "Resubmit" : "Submit"}
            </Button>
          </div>
        </div>
      ) : reviewed ? (
        <p className="text-sm text-success-700">Reviewed — no further changes.</p>
      ) : null}
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- shared bits */

function FileOpenButton({ onOpen }: { onOpen: () => Promise<{ url: string }> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={busy}
      onClick={() => {
        setBusy(true);
        onOpen()
          .then(({ url }) => window.open(url, "_blank", "noopener,noreferrer"))
          .finally(() => setBusy(false));
      }}
    >
      Open
    </Button>
  );
}

function ReasonModal({
  title,
  hint,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  hint: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(reason.trim());
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-sm text-neutral-500">{hint}</p>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-body text-neutral-800 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600"
            rows={3}
            required
          />
        </label>
        {error ? <p className="text-sm text-danger-600">{error}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={reason.trim() === ""}>
            Reopen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
