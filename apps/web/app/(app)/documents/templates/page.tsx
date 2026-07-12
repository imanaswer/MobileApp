"use client";

import type { DocumentTemplateDto, DocumentTypeKey } from "@repo/types";
import Link from "next/link";
import { useState } from "react";

import {
  inputClass,
  labelClass,
  Modal,
  outlineBtn,
  primaryBtn,
  smallGhostBtn,
  TableShell,
} from "@/src/components/academic/ui";
import { CERT_TYPES, DOCUMENT_TYPE_LABEL } from "@/src/components/documents/ui";
import { trpc } from "@/src/trpc/react";

/**
 * Document templates (M15, ADR-023 §4 Step 7) — admin (document:manage). Minimal in v1:
 * a template labels/enables which certificate types the office may generate (the reserved
 * renderer body is not authored yet). Create, rename, and (de)activate.
 */
export default function DocumentTemplatesPage() {
  const utils = trpc.useUtils();
  const list = trpc.documentTemplate.list.useQuery({});
  const rows = list.data ?? [];
  const invalidate = () => void utils.documentTemplate.list.invalidate();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DocumentTemplateDto | null>(null);
  const update = trpc.documentTemplate.update.useMutation({ onSuccess: invalidate });

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link href="/documents" className={outlineBtn}>
            ← Documents
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">Templates</h1>
        </div>
        <button type="button" onClick={() => setCreating(true)} className={primaryBtn}>
          New template
        </button>
      </div>

      <TableShell
        head={["Type", "Name", "Status", "Actions"]}
        isLoading={list.isLoading}
        isError={list.isError}
        isEmpty={rows.length === 0}
        emptyText="No templates yet."
      >
        {rows.map((t) => (
          <tr key={t.id} className="border-b border-border last:border-b-0">
            <td className="px-4 py-3 text-muted-foreground">{DOCUMENT_TYPE_LABEL[t.type]}</td>
            <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
            <td className="px-4 py-3 text-muted-foreground">{t.active ? "Active" : "Inactive"}</td>
            <td className="px-4 py-3">
              <div className="flex gap-1">
                <button type="button" onClick={() => setEditing(t)} className={smallGhostBtn}>
                  Rename
                </button>
                <button
                  type="button"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: t.id, active: !t.active })}
                  className={smallGhostBtn}
                >
                  {t.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </td>
          </tr>
        ))}
      </TableShell>

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
  const [type, setType] = useState<DocumentTypeKey>("BONAFIDE_CERTIFICATE");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = trpc.documentTemplate.create.useMutation({
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });

  return (
    <Modal title="New template" onClose={onClose}>
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
        <label className={labelClass}>
          Type
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
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            required
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={outlineBtn}>
            Cancel
          </button>
          <button type="submit" disabled={create.isPending} className={primaryBtn}>
            {create.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
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
  const [name, setName] = useState(template.name);
  const [error, setError] = useState<string | null>(null);
  const update = trpc.documentTemplate.update.useMutation({
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });

  return (
    <Modal title="Rename template" onClose={onClose}>
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
        <label className={labelClass}>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            required
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={outlineBtn}>
            Cancel
          </button>
          <button type="submit" disabled={update.isPending} className={primaryBtn}>
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
