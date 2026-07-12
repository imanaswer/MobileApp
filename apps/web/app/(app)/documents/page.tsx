"use client";

import { PERMISSIONS, STORAGE_BUCKETS } from "@repo/constants";
import { can } from "@repo/core";
import type { DocumentDto, DocumentTypeKey } from "@repo/types";
import { FileText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { downloadCsv } from "@/src/components/analytics/csv";
import {
  CERT_TYPES,
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPE_LABEL,
  GENERATABLE_TYPES,
} from "@/src/components/documents/ui";
import {
  Button,
  Card,
  type Column,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  PageHeader,
  Select,
  StatusChip,
  useToast,
} from "@/src/components/ui";
import { getSupabaseClient } from "@/src/lib/supabase/client";
import { trpc } from "@/src/trpc/react";

// Link-as-secondary-button (avoid nesting <Button> in <Link>).
const linkBtn =
  "inline-flex h-11 items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-body font-medium text-neutral-800 hover:bg-neutral-50";

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
    return <p className="p-6 text-neutral-500">Loading…</p>;
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
  const { show } = useToast();
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
  const onErr = (e: { message: string }) => {
    setError(e.message);
    show("error", e.message);
  };

  const approve = trpc.document.approve.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Document approved.");
    },
    onError: onErr,
  });
  const archive = trpc.document.archive.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Document archived.");
    },
    onError: onErr,
  });
  const remove = trpc.document.deleteDraft.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Draft deleted.");
    },
    onError: onErr,
  });
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

  const columns: Column<DocumentDto>[] = [
    {
      key: "student",
      header: "Student",
      render: (d) => (
        <span className="font-medium text-neutral-800">{studentName.get(d.studentId) ?? "—"}</span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (d) => <span className="text-neutral-500">{DOCUMENT_TYPE_LABEL[d.type]}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (d) => <StatusChip status={d.status} label={DOCUMENT_STATUS_LABEL[d.status]} />,
    },
    {
      key: "issued",
      header: "Issued",
      render: (d) => <span className="text-neutral-500">{d.snapshot?.issuedOn ?? "—"}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (d) => (
        <div className="flex flex-wrap gap-1">
          {d.hasFile ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={mintDownload.isPending}
              onClick={() => void preview(d)}
            >
              Preview
            </Button>
          ) : (
            <span className="self-center px-1 text-caption text-neutral-500">No file</span>
          )}
          {canApprove && (d.status === "GENERATED" || d.status === "UPLOADED") ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => approve.mutate({ id: d.id })}
            >
              Approve
            </Button>
          ) : null}
          {d.status === "APPROVED" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => archive.mutate({ id: d.id })}
            >
              Archive
            </Button>
          ) : null}
          {d.status === "GENERATED" || d.status === "UPLOADED" ? (
            <Button variant="destructive" size="sm" onClick={() => setDeleting(d)}>
              Delete
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title="Documents & certificates"
        action={
          <div className="flex gap-2">
            <Link href="/documents/templates" className={linkBtn}>
              Templates
            </Link>
            <Button variant="secondary" onClick={() => setUploading(true)}>
              Upload
            </Button>
            <Button icon={FileText} onClick={() => setGenerating(true)}>
              Generate
            </Button>
          </div>
        }
      />

      {/* filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">All students</option>
          {(students.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName}
            </option>
          ))}
        </Select>
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as DocumentTypeKey | "")}
        >
          <option value="">All types</option>
          {CERT_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOCUMENT_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {DOCUMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {DOCUMENT_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>

      {error ? <p className="text-sm text-danger-600">{error}</p> : null}

      <DataTable<DocumentDto>
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        empty={
          <EmptyState
            icon={FileText}
            title="No documents"
            message="No documents match these filters."
          />
        }
      />

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
        <ConfirmDialog
          title="Delete draft document"
          objectName={DOCUMENT_TYPE_LABEL[deleting.type]}
          message={`Delete this ${DOCUMENT_TYPE_LABEL[deleting.type].toLowerCase()} draft? Approved and archived documents can’t be deleted.`}
          busy={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })
          }
        />
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
  const { show } = useToast();
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState<DocumentTypeKey>("BONAFIDE_CERTIFICATE");
  const [error, setError] = useState<string | null>(null);
  const generate = trpc.document.generate.useMutation({
    onSuccess: () => {
      show("success", "Certificate generated.");
      onDone();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Dialog title="Generate certificate" onClose={onClose}>
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
        <Select
          label="Student"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          required
        >
          <option value="">Select a student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName}
            </option>
          ))}
        </Select>
        <Select
          label="Certificate type"
          value={type}
          onChange={(e) => setType(e.target.value as DocumentTypeKey)}
        >
          {GENERATABLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOCUMENT_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <p className="text-caption text-neutral-500">
          The student’s current details are snapshotted at generation, so a later profile change
          won’t alter this certificate.
        </p>
        {error ? <p className="text-sm text-danger-600">{error}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={generate.isPending}>
            Generate
          </Button>
        </div>
      </form>
    </Dialog>
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
  const { show } = useToast();
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
      show("success", "Document uploaded.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Upload document" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-3"
      >
        <Select
          label="Student"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          required
        >
          <option value="">Select a student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName}
            </option>
          ))}
        </Select>
        <Select
          label="Document type"
          value={type}
          onChange={(e) => setType(e.target.value as DocumentTypeKey)}
        >
          {CERT_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOCUMENT_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Field label="File">
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-neutral-800"
            required
          />
        </Field>
        {error ? <p className="text-sm text-danger-600">{error}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={file === null}>
            Upload
          </Button>
        </div>
      </form>
    </Dialog>
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

  const docs = list.data ?? [];
  const columns: Column<DocumentDto>[] = [
    {
      key: "type",
      header: "Type",
      render: (d) => (
        <span className="font-medium text-neutral-800">{DOCUMENT_TYPE_LABEL[d.type]}</span>
      ),
    },
    {
      key: "issued",
      header: "Issued",
      render: (d) => <span className="text-neutral-500">{d.snapshot?.issuedOn ?? "—"}</span>,
    },
    {
      key: "file",
      header: "File",
      render: (d) => <span className="text-neutral-500">{d.fileName ?? "—"}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (d) =>
        d.hasFile ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={mintDownload.isPending}
            onClick={() => void open(d)}
          >
            Download
          </Button>
        ) : (
          <span className="text-caption text-neutral-500">No file yet</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title="Documents" />
      <Card className="max-w-sm">
        <Select label="Student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">Select a student…</option>
          {(students.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName}
            </option>
          ))}
        </Select>
      </Card>

      {error ? <p className="text-sm text-danger-600">{error}</p> : null}

      {studentId ? (
        <DataTable<DocumentDto>
          columns={columns}
          rows={docs}
          rowKey={(d) => d.id}
          loading={list.isLoading}
          error={list.isError}
          onRetry={() => void list.refetch()}
          empty={
            <EmptyState icon={FileText} title="No documents" message="No documents available." />
          }
        />
      ) : null}
    </div>
  );
}
