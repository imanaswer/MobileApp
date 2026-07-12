"use client";

import type { DocumentTemplateDto, DocumentTypeKey } from "@repo/types";
import { FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CERT_TYPES, DOCUMENT_TYPE_LABEL } from "@/src/components/documents/ui";
import {
  Button,
  type Column,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  StatusChip,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

// Link-as-secondary-button (avoid nesting <Button> in <Link>).
const linkBtn =
  "inline-flex h-11 items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-body font-medium text-neutral-800 hover:bg-neutral-50";

/**
 * Document templates (M15, ADR-023 §4 Step 7) — admin (document:manage). Minimal in v1:
 * a template labels/enables which certificate types the office may generate (the reserved
 * renderer body is not authored yet). Create, rename, and (de)activate.
 */
export default function DocumentTemplatesPage() {
  const { show } = useToast();
  const utils = trpc.useUtils();
  const list = trpc.documentTemplate.list.useQuery({});
  const rows = list.data ?? [];
  const invalidate = () => void utils.documentTemplate.list.invalidate();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DocumentTemplateDto | null>(null);
  const update = trpc.documentTemplate.update.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Template updated.");
    },
    onError: (e) => show("error", e.message),
  });

  const columns: Column<DocumentTemplateDto>[] = [
    {
      key: "type",
      header: "Type",
      render: (t) => <span className="text-neutral-500">{DOCUMENT_TYPE_LABEL[t.type]}</span>,
    },
    {
      key: "name",
      header: "Name",
      render: (t) => <span className="font-medium text-neutral-800">{t.name}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (t) => (
        <StatusChip
          status={t.active ? "APPROVED" : "ARCHIVED"}
          label={t.active ? "Active" : "Inactive"}
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (t) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
            Rename
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: t.id, active: !t.active })}
          >
            {t.active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title="Templates"
        breadcrumb={
          <Link href="/documents" className={linkBtn}>
            ← Documents
          </Link>
        }
        action={
          <Button icon={FileText} onClick={() => setCreating(true)}>
            New template
          </Button>
        }
      />

      <DataTable<DocumentTemplateDto>
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        empty={<EmptyState icon={FileText} title="No templates yet" />}
      />

      {creating ? (
        <CreateModal
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            invalidate();
          }}
        />
      ) : null}
      {editing ? (
        <RenameModal
          template={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { show } = useToast();
  const [type, setType] = useState<DocumentTypeKey>("BONAFIDE_CERTIFICATE");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = trpc.documentTemplate.create.useMutation({
    onSuccess: () => {
      show("success", "Template created.");
      onDone();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Dialog title="New template" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            setError("Enter a name");
            return;
          }
          setError(null);
          create.mutate({ type, name: name.trim() });
        }}
        className="flex flex-col gap-3"
      >
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as DocumentTypeKey)}
        >
          {CERT_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOCUMENT_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        {error ? <p className="text-sm text-danger-600">{error}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RenameModal({
  template,
  onClose,
  onDone,
}: {
  template: DocumentTemplateDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const { show } = useToast();
  const [name, setName] = useState(template.name);
  const [error, setError] = useState<string | null>(null);
  const update = trpc.documentTemplate.update.useMutation({
    onSuccess: () => {
      show("success", "Template saved.");
      onDone();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Dialog title="Rename template" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            setError("Enter a name");
            return;
          }
          setError(null);
          update.mutate({ id: template.id, name: name.trim() });
        }}
        className="flex flex-col gap-3"
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        {error ? <p className="text-sm text-danger-600">{error}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={update.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
