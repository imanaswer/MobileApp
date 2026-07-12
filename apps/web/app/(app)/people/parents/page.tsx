"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { ParentDto, PreferredContactKey } from "@repo/types";
import { Users } from "lucide-react";
import { useCallback, useState } from "react";

import { Paginator, usePagedSearch } from "@/src/components/academic/ui";
import {
  Avatar,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  SearchInput,
  StatusChip,
  TableToolbar,
  useToast,
  type Column,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

const CONTACTS: readonly PreferredContactKey[] = ["PHONE", "EMAIL", "WHATSAPP"];

const CONTACT_LABEL: Record<PreferredContactKey, string> = {
  PHONE: "Phone",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
};

/**
 * Parent/guardian records CRUD. Linking a parent to a student happens on the
 * student detail page (the StudentParent junction). Deleting is blocked by the
 * service/DB while links exist. The PARENT role sees only their own record
 * (service row scope) with no actions.
 */
export default function ParentsPage() {
  const me = trpc.auth.me.useQuery();
  const canManage = me.data !== undefined && can(me.data.role, PERMISSIONS.PARENT_MANAGE);
  const { show } = useToast();

  const parents = trpc.parent.list.useQuery();
  const utils = trpc.useUtils();
  const invalidate = () => utils.parent.list.invalidate();

  const create = trpc.parent.create.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Parent created");
    },
    onError: (e) => show("error", e.message),
  });
  const update = trpc.parent.update.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Parent updated");
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.parent.delete.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Parent deleted");
    },
    onError: (e) => show("error", e.message),
  });

  const [editing, setEditing] = useState<ParentDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<ParentDto | null>(null);

  const paged = usePagedSearch(
    parents.data,
    useCallback(
      (parent: ParentDto, q: string) =>
        parent.name.toLowerCase().includes(q) ||
        parent.phone.toLowerCase().includes(q) ||
        (parent.email ?? "").toLowerCase().includes(q),
      [],
    ),
  );

  const columns: Column<ParentDto>[] = [
    {
      key: "name",
      header: "Name",
      render: (p) => (
        <div className="flex items-center gap-3">
          <Avatar name={p.name} size="sm" />
          <span className="font-medium text-neutral-800">{p.name}</span>
        </div>
      ),
    },
    { key: "phone", header: "Phone", render: (p) => p.phone },
    { key: "email", header: "Email", render: (p) => p.email ?? "—" },
    { key: "occupation", header: "Occupation", render: (p) => p.occupation ?? "—" },
    {
      key: "preferredContact",
      header: "Preferred contact",
      render: (p) => (
        <StatusChip status={p.preferredContact} label={CONTACT_LABEL[p.preferredContact]} />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (p) =>
        canManage ? (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                create.reset();
                update.reset();
                setEditing(p);
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
                setDeleting(p);
              }}
            >
              Delete
            </Button>
          </div>
        ) : (
          <span className="text-neutral-500">—</span>
        ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Parents"
        action={
          canManage ? (
            <Button
              icon={Users}
              onClick={() => {
                create.reset();
                update.reset();
                setEditing("new");
              }}
            >
              New parent
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        rows={paged.pageItems}
        rowKey={(p) => p.id}
        loading={parents.isLoading}
        error={parents.isError}
        onRetry={() => void parents.refetch()}
        empty={<EmptyState icon={Users} title="No parents yet." />}
        toolbar={
          <TableToolbar
            search={
              <SearchInput
                value={paged.query}
                onChange={(e) => paged.setQuery(e.target.value)}
                aria-label="Search parents"
              />
            }
          />
        }
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
        <ParentFormModal
          parent={editing === "new" ? null : editing}
          busy={create.isPending || update.isPending}
          error={create.error?.message ?? update.error?.message ?? null}
          onClose={() => setEditing(null)}
          onSubmit={(values) => {
            const done = { onSuccess: () => setEditing(null) };
            if (editing === "new") {
              create.mutate(
                {
                  name: values.name,
                  phone: values.phone,
                  ...(values.email ? { email: values.email } : {}),
                  ...(values.occupation ? { occupation: values.occupation } : {}),
                  ...(values.address ? { address: values.address } : {}),
                  preferredContact: values.preferredContact,
                },
                done,
              );
            } else {
              update.mutate(
                {
                  id: editing.id,
                  name: values.name,
                  phone: values.phone,
                  email: values.email || null,
                  occupation: values.occupation || null,
                  address: values.address || null,
                  preferredContact: values.preferredContact,
                },
                done,
              );
            }
          }}
        />
      ) : null}

      {deleting !== null ? (
        <ConfirmDialog
          title="Delete parent"
          objectName={deleting.name}
          message="Permanently delete this parent? Parents still linked to a student cannot be deleted — unlink them first:"
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

interface ParentFormValues {
  name: string;
  phone: string;
  email: string;
  occupation: string;
  address: string;
  preferredContact: PreferredContactKey;
}

function ParentFormModal({
  parent,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  parent: ParentDto | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: ParentFormValues) => void;
}) {
  const [name, setName] = useState(parent?.name ?? "");
  const [phone, setPhone] = useState(parent?.phone ?? "");
  const [email, setEmail] = useState(parent?.email ?? "");
  const [occupation, setOccupation] = useState(parent?.occupation ?? "");
  const [address, setAddress] = useState(parent?.address ?? "");
  const [preferredContact, setPreferredContact] = useState<PreferredContactKey>(
    parent?.preferredContact ?? "PHONE",
  );

  return (
    <Dialog title={parent ? "Edit parent" : "New parent"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            occupation: occupation.trim(),
            address: address.trim(),
            preferredContact,
          });
        }}
        className="flex flex-col gap-4"
      >
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Input
          label="Occupation"
          value={occupation}
          onChange={(e) => setOccupation(e.target.value)}
        />
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Address
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="min-h-20 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-body text-neutral-800 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600"
            rows={3}
          />
        </label>
        <Select
          label="Preferred contact"
          value={preferredContact}
          onChange={(e) => setPreferredContact(e.target.value as PreferredContactKey)}
        >
          {CONTACTS.map((c) => (
            <option key={c} value={c}>
              {CONTACT_LABEL[c]}
            </option>
          ))}
        </Select>

        {error ? <p className="text-sm text-danger-600">{error}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
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
