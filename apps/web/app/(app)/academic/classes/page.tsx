"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { ClassDto } from "@repo/types";
import { Plus, School } from "lucide-react";
import Link from "next/link";
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

/** Classes CRUD. Sections are managed on the class's detail page. */
export default function ClassesPage() {
  const { show } = useToast();
  const me = trpc.auth.me.useQuery();
  const canManage = me.data !== undefined && can(me.data.role, PERMISSIONS.ACADEMIC_MANAGE);

  const classes = trpc.class.list.useQuery();
  const utils = trpc.useUtils();
  const invalidate = () => utils.class.list.invalidate();

  const create = trpc.class.create.useMutation({
    onSuccess: () => {
      show("success", "Class created");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const update = trpc.class.update.useMutation({
    onSuccess: () => {
      show("success", "Class updated");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.class.delete.useMutation({
    onSuccess: () => {
      show("success", "Class deleted");
      return invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  const [editing, setEditing] = useState<ClassDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<ClassDto | null>(null);

  const paged = usePagedSearch(
    classes.data,
    useCallback((item: ClassDto, q: string) => item.name.toLowerCase().includes(q), []),
  );

  const columns: Column<ClassDto>[] = [
    {
      key: "name",
      header: "Name",
      render: (item) => <span className="font-medium text-neutral-800">{item.name}</span>,
    },
    {
      key: "sortOrder",
      header: "Sort order",
      render: (item) => <span className="text-neutral-500">{item.sortOrder}</span>,
    },
    {
      key: "sections",
      header: "Sections",
      render: (item) => (
        <Link
          href={`/academic/classes/${item.id}`}
          className="font-medium text-primary-700 hover:underline"
        >
          Manage sections
        </Link>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (item) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                create.reset();
                update.reset();
                setEditing(item);
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
                setDeleting(item);
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
        rowKey={(item) => item.id}
        loading={classes.isLoading}
        error={classes.isError}
        onRetry={() => classes.refetch()}
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
                  New class
                </Button>
              ) : undefined
            }
          />
        }
        empty={<EmptyState icon={School} title="No classes yet." />}
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
        <ClassFormModal
          item={editing === "new" ? null : editing}
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
          title="Delete class"
          objectName={deleting.name}
          message="Permanently delete this class? Classes with sections cannot be deleted —"
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

function ClassFormModal({
  item,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  item: ClassDto | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { name: string; sortOrder: number }) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? 0));

  return (
    <Dialog title={item ? "Edit class" : "New class"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name: name.trim(), sortOrder: Number(sortOrder) });
        }}
        className="flex flex-col gap-4"
      >
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Class 5"
          required
        />
        <Input
          label="Sort order"
          type="number"
          step="1"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
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
