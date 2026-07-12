"use client";

import { PERMISSIONS, STORAGE_BUCKETS } from "@repo/constants";
import { can } from "@repo/core";
import type { DocumentDto, DocumentTypeKey } from "@repo/types";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  inputClass,
  labelClass,
  Modal,
  outlineBtn,
  primaryBtn,
  smallDangerBtn,
  smallGhostBtn,
  TableShell,
} from "@/src/components/academic/ui";
import { downloadCsv } from "@/src/components/analytics/csv";
import {
  CERT_TYPES,
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPE_LABEL,
  DocumentStatusBadge,
  GENERATABLE_TYPES,
} from "@/src/components/documents/ui";
import { getSupabaseClient } from "@/src/lib/supabase/client";
import { trpc } from "@/src/trpc/react";

/**
 * Document management (M15, ADR-023 Step 7). Admin (document:manage) gets the school-wide
 * console — filter by student/type/status, generate certificates (snapshot frozen server-
 * side), upload prepared files (mint → push to signed URL → persist), run the approval
 * workflow (approve/archive/delete draft), preview (60s signed URL), and CSV export.
 * Teachers/parents (document:read) get a read-only view of a student's APPROVED documents.
 * Thin client over the tRPC surface; the service is the authority.
 */
export default function DocumentsPage() {
  const me = trpc.auth.me.useQuery();
  const role = me.data?.role;
  if (role === undefined) {
    return <p className="p-6 text-muted-foreground">Loading…</p>;
  }
  return can(role, PERMISSIONS.DOCUMENT_MANAGE) ? (
    <AdminConsole canApprove={can(role, PERMISSIONS.DOCUMENT_APPROVE)} />
  ) : (
    <ReadOnlyDocuments />
  );
}

// ---------------------------------------------------------------------------
// Admin console
// ---------------------------------------------------------------------------

function AdminConsole({ canApprove }: { canApprove: boolean }) {
  const utils = trpc.useUtils();
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState<DocumentTypeKey | "">("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<DocumentDto | null>(null);

  const students = trpc.student.list.useQuery();
  const studentName = useMemo(
    () => new Map((students.data ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName}`])),
    [students.data],
  );

  const list = trpc.document.list.useQuery({
    ...(studentId ? { studentId } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status: status as DocumentDto["status"] } : {}),
  });
  const rows = list.data ?? [];
  const invalidate = () => void utils.document.list.invalidate();
  const onErr = (e: { message: string }) => setError(e.message);

  const approve = trpc.document.approve.useMutation({ onSuccess: invalidate, onError: onErr });
  const archive = trpc.document.archive.useMutation({ onSuccess: invalidate, onError: onErr });
  const remove = trpc.document.deleteDraft.useMutation({ onSuccess: invalidate, onError: onErr });
  const mintDownload = trpc.document.downloadUrl.useMutation();

  async function preview(doc: DocumentDto) {
    setError(null);
    try {
      const { url } = await mintDownload.mutateAsync({ id: doc.id });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the document");
    }
  }

  function exportCsv() {
    downloadCsv(
      "documents.csv",
      ["Student", "Type", "Status", "Issued on", "File"],
      rows.map((d) => [
        studentName.get(d.studentId) ?? d.studentId,
        DOCUMENT_TYPE_LABEL[d.type],
        DOCUMENT_STATUS_LABEL[d.status],
        d.snapshot?.issuedOn ?? "",
        d.fileName ?? "",
      ]),
    );
  }

  const busy = approve.isPending || archive.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Documents &amp; certificates</h1>
        <div className="flex gap-2">
          <Link href="/documents/templates" className={outlineBtn}>
            Templates
          </Link>
          <button type="button" onClick={() => setUploading(true)} className={outlineBtn}>
            Upload
          </button>
          <button type="button" onClick={() => setGenerating(true)} className={primaryBtn}>
            Generate
          </button>
        </div>
      </div>

      {/* filters */}
      <div className="flex flex-wrap gap-3">
        <label className={labelClass}>
          Student
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className={inputClass}
          >
            <option value="">All students</option>
            {(students.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DocumentTypeKey | "")}
            className={inputClass}
          >
            <option value="">All types</option>
            {CERT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="">All statuses</option>
            {DOCUMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DOCUMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className={outlineBtn}
          >
            Export CSV
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <TableShell
        head={["Student", "Type", "Status", "Issued", "Actions"]}
        isLoading={list.isLoading}
        isError={list.isError}
        isEmpty={rows.length === 0}
        emptyText="No documents match these filters."
      >
        {rows.map((d) => (
          <tr key={d.id} className="border-b border-border last:border-b-0">
            <td className="px-4 py-3 font-medium text-foreground">
              {studentName.get(d.studentId) ?? "—"}
            </td>
            <td className="px-4 py-3 text-muted-foreground">{DOCUMENT_TYPE_LABEL[d.type]}</td>
            <td className="px-4 py-3">
              <DocumentStatusBadge status={d.status} />
            </td>
            <td className="px-4 py-3 text-muted-foreground">{d.snapshot?.issuedOn ?? "—"}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1">
                {d.hasFile ? (
                  <button
                    type="button"
                    onClick={() => void preview(d)}
                    disabled={mintDownload.isPending}
                    className={smallGhostBtn}
                  >
                    Preview
                  </button>
                ) : (
                  <span className="self-center px-1 text-xs text-muted-foreground">No file</span>
                )}
                {canApprove && (d.status === "GENERATED" || d.status === "UPLOADED") ? (
                  <button
                    type="button"
                    onClick={() => approve.mutate({ id: d.id })}
                    disabled={busy}
                    className={smallGhostBtn}
                  >
                    Approve
                  </button>
                ) : null}
                {d.status === "APPROVED" ? (
                  <button
                    type="button"
                    onClick={() => archive.mutate({ id: d.id })}
                    disabled={busy}
                    className={smallGhostBtn}
                  >
                    Archive
                  </button>
                ) : null}
                {d.status === "GENERATED" || d.status === "UPLOADED" ? (
                  <button type="button" onClick={() => setDeleting(d)} className={smallDangerBtn}>
                    Delete
                  </button>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </TableShell>

      {generating ? (
        <GenerateModal
          students={students.data ?? []}
          onClose={() => setGenerating(false)}
          onDone={() => {
            setGenerating(false);
            invalidate();
          }}
        />
      ) : null}

      {uploading ? (
        <UploadModal
          students={students.data ?? []}
          onClose={() => setUploading(false)}
          onDone={() => {
            setUploading(false);
            invalidate();
          }}
        />
      ) : null}

      {deleting ? (
        <Modal title="Delete draft document" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Delete this {DOCUMENT_TYPE_LABEL[deleting.type].toLowerCase()} draft? Approved and
            archived documents can’t be deleted.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setDeleting(null)} className={outlineBtn}>
              Cancel
            </button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })
              }
              className={smallDangerBtn}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

type StudentOption = { id: string; firstName: string; lastName: string };

function GenerateModal({
  students,
  onClose,
  onDone,
}: {
  students: StudentOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState<DocumentTypeKey>("BONAFIDE_CERTIFICATE");
  const [error, setError] = useState<string | null>(null);
  const generate = trpc.document.generate.useMutation({
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });

  return (
    <Modal title="Generate certificate" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!studentId) {
            setError("Pick a student");
            return;
          }
          setError(null);
          generate.mutate({ studentId, type });
        }}
        className="flex flex-col gap-3"
      >
        <label className={labelClass}>
          Student
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Select a student…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Certificate type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DocumentTypeKey)}
            className={inputClass}
          >
            {GENERATABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          The student’s current details are snapshotted at generation, so a later profile change
          won’t alter this certificate.
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={outlineBtn}>
            Cancel
          </button>
          <button type="submit" disabled={generate.isPending} className={primaryBtn}>
            {generate.isPending ? "Generating…" : "Generate"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UploadModal({
  students,
  onClose,
  onDone,
}: {
  students: StudentOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState<DocumentTypeKey>("FEE_RECEIPT");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mintUpload = trpc.document.uploadUrl.useMutation();
  const createDoc = trpc.document.createUploaded.useMutation();

  async function submit() {
    if (!studentId || !file) {
      setError("Pick a student and a file");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const minted = await mintUpload.mutateAsync({ studentId, fileName: file.name });
      const { error: upErr } = await getSupabaseClient()
        .storage.from(STORAGE_BUCKETS.DOCUMENTS)
        .uploadToSignedUrl(minted.storagePath, minted.token, file);
      if (upErr) {
        throw new Error(`File upload failed: ${upErr.message}`);
      }
      await createDoc.mutateAsync({
        studentId,
        type,
        storagePath: minted.storagePath,
        fileName: file.name,
        ...(file.type ? { mimeType: file.type } : {}),
        sizeBytes: file.size,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Upload document" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-3"
      >
        <label className={labelClass}>
          Student
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Select a student…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Document type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DocumentTypeKey)}
            className={inputClass}
          >
            {CERT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          File
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={inputClass}
            required
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={outlineBtn}>
            Cancel
          </button>
          <button type="submit" disabled={busy || file === null} className={primaryBtn}>
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Read-only view (teacher / parent) — a student's APPROVED documents
// ---------------------------------------------------------------------------

function ReadOnlyDocuments() {
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const students = trpc.student.list.useQuery();
  const list = trpc.document.listStudentDocuments.useQuery({ studentId }, { enabled: !!studentId });
  const mintDownload = trpc.document.downloadUrl.useMutation();

  async function open(doc: DocumentDto) {
    setError(null);
    try {
      const { url } = await mintDownload.mutateAsync({ id: doc.id });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the document");
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold text-foreground">Documents</h1>
      <label className={labelClass}>
        Student
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className={inputClass}
        >
          <option value="">Select a student…</option>
          {(students.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName}
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {studentId ? (
        <TableShell
          head={["Type", "Issued", "File", "Actions"]}
          isLoading={list.isLoading}
          isError={list.isError}
          isEmpty={(list.data ?? []).length === 0}
          emptyText="No documents available."
        >
          {(list.data ?? []).map((d) => (
            <tr key={d.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3 font-medium text-foreground">
                {DOCUMENT_TYPE_LABEL[d.type]}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{d.snapshot?.issuedOn ?? "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{d.fileName ?? "—"}</td>
              <td className="px-4 py-3">
                {d.hasFile ? (
                  <button
                    type="button"
                    onClick={() => void open(d)}
                    disabled={mintDownload.isPending}
                    className={smallGhostBtn}
                  >
                    Download
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">No file yet</span>
                )}
              </td>
            </tr>
          ))}
        </TableShell>
      ) : null}
    </div>
  );
}
