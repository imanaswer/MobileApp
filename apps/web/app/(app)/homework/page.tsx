"use client";

import type { HomeworkTargetDto } from "@repo/types";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { HW_STATUS_LABEL } from "@/src/components/homework/ui";
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  StatusChip,
  TableToolbar,
  useToast,
  type Column,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/**
 * Homework dashboard (M6, ADR-013), role-aware:
 * - admin → a year's homework (all states) + create;
 * - teacher → own (subject × section) homework + create;
 * - parent → PUBLISHED/CLOSED homework for their children (§10 or-clause).
 * Lifecycle, files, submissions + review live on the detail page.
 */
export default function HomeworkDashboardPage() {
  const me = trpc.auth.me.useQuery();
  const role = me.data?.role;
  const isAdmin = role === "SUPER_ADMIN" || role === "OFFICE_ADMIN";
  const isParent = role === "PARENT";
  const canManage = role === "SUPER_ADMIN" || role === "OFFICE_ADMIN" || role === "TEACHER";

  const years = trpc.academicYear.list.useQuery(undefined, { enabled: isAdmin });
  const [yearId, setYearId] = useState("");
  useEffect(() => {
    if (isAdmin && yearId === "" && years.data) {
      const active = years.data.find((y) => y.status === "ACTIVE") ?? years.data[0];
      if (active) setYearId(active.id);
    }
  }, [isAdmin, years.data, yearId]);

  const homework = trpc.homework.list.useQuery(isAdmin ? { academicYearId: yearId } : {}, {
    enabled: !isAdmin || yearId !== "",
  });
  const targets = trpc.homework.targets.useQuery(undefined, { enabled: canManage });
  const label = new Map(
    (targets.data ?? []).map((t) => [
      `${t.subjectId}:${t.sectionId}`,
      `${t.subjectName} · ${t.sectionName}`,
    ]),
  );

  const [creating, setCreating] = useState(false);
  const rows = homework.data ?? [];

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: "title",
      header: "Title",
      render: (h) => (
        <Link href={`/homework/${h.id}`} className="font-medium text-primary-700 hover:underline">
          {h.title}
        </Link>
      ),
    },
    ...(isParent
      ? []
      : [
          {
            key: "target",
            header: "Subject · Section",
            render: (h: Row) => (
              <span className="text-neutral-500">
                {label.get(`${h.subjectId}:${h.sectionId}`) ?? "—"}
              </span>
            ),
          },
        ]),
    {
      key: "due",
      header: "Due",
      render: (h) => <span className="text-neutral-500">{h.dueDate}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (h) => <StatusChip status={h.status} label={HW_STATUS_LABEL[h.status]} />,
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Homework"
        action={
          canManage ? (
            <Button icon={BookOpen} onClick={() => setCreating(true)}>
              New homework
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(h) => h.id}
        loading={homework.isLoading}
        error={homework.isError}
        onRetry={() => void homework.refetch()}
        toolbar={
          isAdmin ? (
            <TableToolbar
              filters={
                <Select
                  label="Academic year"
                  value={yearId}
                  onChange={(e) => setYearId(e.target.value)}
                >
                  {(years.data ?? []).map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                      {y.status === "ACTIVE" ? " (active)" : ""}
                    </option>
                  ))}
                </Select>
              }
            />
          ) : undefined
        }
        empty={
          <EmptyState
            icon={BookOpen}
            title={isParent ? "No homework published for your children yet." : "No homework yet."}
          />
        }
      />

      {creating ? (
        <CreateHomeworkModal
          targets={targets.data ?? []}
          onClose={() => setCreating(false)}
          onCreated={() => {
            void homework.refetch();
            setCreating(false);
          }}
        />
      ) : null}
    </section>
  );
}

function CreateHomeworkModal({
  targets,
  onClose,
  onCreated,
}: {
  targets: HomeworkTargetDto[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { show } = useToast();
  const create = trpc.homework.create.useMutation({
    onSuccess: () => {
      show("success", "Homework draft created");
      onCreated();
    },
    onError: (e) => show("error", e.message),
  });
  const [pair, setPair] = useState(
    targets[0] ? `${targets[0].subjectId}:${targets[0].sectionId}` : "",
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const selected = targets.find((t) => `${t.subjectId}:${t.sectionId}` === pair);

  return (
    <Dialog title="New homework" onClose={onClose}>
      {targets.length === 0 ? (
        <p className="text-sm text-neutral-500">
          You have no subject/section assignments to create homework for. (Admins: create from a
          teacher account, or assign yourself in academic structure.)
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!selected) return;
            create.mutate({
              subjectId: selected.subjectId,
              sectionId: selected.sectionId,
              title: title.trim(),
              description: description.trim() === "" ? null : description.trim(),
              dueDate,
            });
          }}
          className="flex flex-col gap-3"
        >
          <Select
            label="Subject & section"
            value={pair}
            onChange={(e) => setPair(e.target.value)}
            required
          >
            {targets.map((t) => (
              <option key={`${t.subjectId}:${t.sectionId}`} value={`${t.subjectId}:${t.sectionId}`}>
                {t.subjectName} · {t.sectionName}
              </option>
            ))}
          </Select>
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-body text-neutral-800 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600"
              rows={3}
            />
          </label>
          <Input
            label="Due date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
          {create.error ? <p className="text-sm text-danger-600">{create.error.message}</p> : null}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending} disabled={title.trim() === ""}>
              Create draft
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
