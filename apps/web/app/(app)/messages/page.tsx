"use client";

import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Card, EmptyState, PageHeader, Select, SkeletonText } from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/** A short "when" for the thread list — date for older, time for today. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString();
}

/**
 * Teacher ↔ parent messaging (M18). The caller's threads (newest-active first) with a
 * "New message" composer. Each row resolves its counterparty name via
 * `message.counterparties(studentId)` — the only way to name the other party, since it
 * is not resolvable client-side. Tapping a row opens the conversation.
 */
export default function MessagesPage() {
  const router = useRouter();
  const me = trpc.auth.me.useQuery();
  const myUserId = me.data?.userId;
  // Modest poll so a reply shows up without a manual reopen (no realtime yet).
  const threads = trpc.message.listThreads.useQuery({}, { refetchInterval: 20_000 });
  const students = trpc.student.list.useQuery();
  const studentName = new Map(
    (students.data ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName}`]),
  );
  const [composing, setComposing] = useState(false);

  const rows = threads.data?.items ?? [];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <PageHeader
        title="Messages"
        action={
          <Button icon={MessageSquare} onClick={() => setComposing(true)}>
            New message
          </Button>
        }
      />

      {composing ? (
        <Composer studentName={studentName} onClose={() => setComposing(false)} />
      ) : null}

      <section className="flex flex-col gap-2">
        {threads.isLoading ? (
          <Card>
            <SkeletonText lines={4} />
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState icon={MessageSquare} title="No conversations yet" />
          </Card>
        ) : (
          rows.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              studentLabel={studentName.get(t.studentId) ?? "Student"}
              myUserId={myUserId}
              onOpen={(name) =>
                router.push(
                  `/messages/${t.id}?name=${encodeURIComponent(name)}&student=${encodeURIComponent(
                    studentName.get(t.studentId) ?? "",
                  )}`,
                )
              }
            />
          ))
        )}
      </section>
    </main>
  );
}

/** One thread row; resolves the counterparty's name (falls back to a role label). */
function ThreadRow({
  thread,
  studentLabel,
  myUserId,
  onOpen,
}: {
  thread: {
    id: string;
    staffUserId: string;
    guardianUserId: string;
    studentId: string;
    lastMessageAt: string;
    unreadCount: number;
    lastMessagePreview: string | null;
  };
  studentLabel: string;
  myUserId: string | undefined;
  onOpen: (counterpartyName: string) => void;
}) {
  const iAmStaff = thread.staffUserId === myUserId;
  const counterpartyUserId = iAmStaff ? thread.guardianUserId : thread.staffUserId;
  // A persisted thread whose student left scope makes this 403 — degrade, don't break.
  const cps = trpc.message.counterparties.useQuery(
    { studentId: thread.studentId },
    { retry: false },
  );
  const resolved = cps.data?.find((c) => c.userId === counterpartyUserId)?.name;
  const name = resolved ?? (iAmStaff ? "Parent" : "Teacher");

  return (
    <Card interactive onClick={() => onOpen(name)} className="flex items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          <span className="font-semibold text-neutral-900">{name}</span>
          <span className="text-neutral-500"> · {studentLabel}</span>
        </span>
        {thread.lastMessagePreview ? (
          <span
            className={`block truncate text-sm ${
              thread.unreadCount > 0 ? "font-medium text-neutral-800" : "text-neutral-500"
            }`}
          >
            {thread.lastMessagePreview}
          </span>
        ) : null}
      </span>
      {thread.unreadCount > 0 ? (
        <span
          aria-label={`${thread.unreadCount} unread`}
          className="rounded-full bg-primary-600 px-2 py-0.5 text-caption font-semibold text-white"
        >
          {thread.unreadCount}
        </span>
      ) : null}
      <span className="text-caption text-neutral-500">{whenLabel(thread.lastMessageAt)}</span>
    </Card>
  );
}

/** New-message flow: pick a student → pick a counterparty → open (or reuse) the thread. */
function Composer({
  studentName,
  onClose,
}: {
  studentName: Map<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [otherUserId, setOtherUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const counterparties = trpc.message.counterparties.useQuery(
    { studentId },
    { enabled: !!studentId, retry: false },
  );
  const create = trpc.message.createThread.useMutation({
    onSuccess: (thread) => {
      const name = counterparties.data?.find((c) => c.userId === otherUserId)?.name ?? "";
      router.push(
        `/messages/${thread.id}?name=${encodeURIComponent(name)}&student=${encodeURIComponent(
          studentName.get(thread.studentId) ?? "",
        )}`,
      );
    },
    onError: (e) => setError(e.message),
  });

  const options = [...studentName.entries()];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-title text-neutral-900">New message</h2>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {error ? <p className="text-sm text-danger-600">{error}</p> : null}

      <Select
        label="Student"
        value={studentId}
        onChange={(e) => {
          setStudentId(e.target.value);
          setOtherUserId("");
        }}
      >
        <option value="">Select…</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </Select>

      {studentId ? (
        <Select
          label="Recipient"
          value={otherUserId}
          onChange={(e) => setOtherUserId(e.target.value)}
          disabled={counterparties.isLoading}
        >
          <option value="">{counterparties.isLoading ? "Loading…" : "Select…"}</option>
          {(counterparties.data ?? []).map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.name}
            </option>
          ))}
        </Select>
      ) : null}

      {studentId && !counterparties.isLoading && (counterparties.data ?? []).length === 0 ? (
        <p className="text-sm text-neutral-500">No one to message about this student.</p>
      ) : null}

      <Button
        disabled={!studentId || !otherUserId}
        loading={create.isPending}
        onClick={() => {
          setError(null);
          create.mutate({ studentId, otherUserId });
        }}
      >
        Start conversation
      </Button>
    </Card>
  );
}
