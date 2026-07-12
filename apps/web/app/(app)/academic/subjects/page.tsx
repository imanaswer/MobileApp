"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { SubjectDto } from "@repo/types";
import { BookMarked, Plus } from "lucide-react";
import { useCallback, useState } from "react";

import { Paginator, usePagedSearch } from "@/src/components/academic/ui";
import {
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  SearchInput,
  TableToolbar,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/** Subjects CRUD — a school-wide catalog; names are unique per school. */
export default function SubjectsPage() {
  const { show } = useToast();
  const me = trpc.auth.me.useQuery();
  const canManage = me.data !== undefined && can(me.data.role, PERMISSIONS.ACADEMIC_MANAGE);

  const subjects = trpc.subject.list.useQuery();
  const utils = trpc.useUtils();
  const invalidate = () => utils.subject.list.invalidate();

  const create = trpc.subject.create.useMutation({
    onSuccess: () => {
      show("success", "Subject created");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const update = trpc.subject.update.useMutation({
    onSuccess: () => {
      show("success", "Subject updated");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.subject.delete.useMutation({
    onSuccess: () => {
      show("success", "Subject deleted");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  const [editing, setEditing] = useState<SubjectDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<SubjectDto | null>(null);

  const paged = usePagedSearch(
    subjects.data,
    useCallback((subject: SubjectDto, q: string) => subject.name.toLowerCase().includes(q), []),
  );

  const columns: Column<SubjectDto>[] = [
    {
      key: "name",
      header: "Name",
      render: (subject) => <span className="font-medium text-neutral-800">{subject.name}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (subject) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                create.reset();
                update.reset();
                setEditing(subject);
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-600 hover:bg-danger-50"
              onClick={() => {
                remove.reset();
                setDeleting(subject);
              }}
            >
              Delete
            </Button>
          </div>
        ) : (
          <span className="text-neutral-400">—</span>
        ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        rows={paged.pageItems}
        rowKey={(subject) => subject.id}
        loading={subjects.isLoading}
        error={subjects.isError}
        onRetry={() => subjects.refetch()}
        toolbar={
          <TableToolbar
            search={
              <SearchInput value={paged.query} onChange={(e) => paged.setQuery(e.target.value)} />
            }
            actions={
              canManage ? (
                <Button
                  icon={Plus}
                  onClick={() => {
                    create.reset();
                    update.reset();
                    setEditing("new");
                  }}
                >
                  New subject
                </Button>
              ) : undefined
            }
          />
        }
        empty={<EmptyState icon={BookMarked} title="No subjects yet." />}
        footer={
          <Paginator
            page={paged.page}
            pageCount={paged.pageCount}
            total={paged.total}
            onPage={paged.setPage}
          />
        }
      />

      {editing !== null ? (
        <SubjectFormModal
          subject={editing === "new" ? null : editing}
          busy={create.isPending || update.isPending}
          error={create.error?.message ?? update.error?.message ?? null}
          onClose={() => setEditing(null)}
          onSubmit={(values) => {
            const done = { onSuccess: () => setEditing(null) };
            if (editing === "new") create.mutate(values, done);
            else update.mutate({ id: editing.id, ...values }, done);
          }}
        />
      ) : null}

      {deleting !== null ? (
        <ConfirmDialog
          title="Delete subject"
          objectName={deleting.name}
          message="Permanently delete this subject? Subjects with teacher assignments cannot be deleted —"
          busy={remove.isPending}
          error={remove.error?.message ?? null}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })
          }
        />
      ) : null}
    </section>
  );
}

function SubjectFormModal({
  subject,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  subject: SubjectDto | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { name: string }) => void;
}) {
  const [name, setName] = useState(subject?.name ?? "");

  return (
    <Dialog title={subject ? "Edit subject" : "New subject"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name: name.trim() });
        }}
        className="flex flex-col gap-4"
      >
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mathematics"
          required
        />

        {error ? <p className="text-sm text-danger-600">{error}</p> : null}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
