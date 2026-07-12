"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { NotificationDto, NotificationPriorityKey } from "@repo/types";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { deepLinkForType, timeAgo } from "@/src/components/notification/ui";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  SkeletonText,
  useToast,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

const textareaClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-body text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:opacity-60";

/**
 * Notifications page (M10, ADR-018 Step 8). The signed-in user's inbox — mark read
 * (row click also deep-links), archive, mark all read — plus, for admins
 * (announcement:send), the announcement composer (bulk school-wide or one section).
 */
export default function NotificationsPage() {
  const router = useRouter();
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const list = trpc.notification.list.useQuery({});
  const notifications = list.data ?? [];

  const refresh = () => {
    void utils.notification.unreadCount.invalidate();
    void utils.notification.list.invalidate();
  };
  const markRead = trpc.notification.markRead.useMutation({ onSuccess: refresh });
  const markAllRead = trpc.notification.markAllRead.useMutation({ onSuccess: refresh });
  const archive = trpc.notification.archive.useMutation({ onSuccess: refresh });

  const role = me.data?.role;
  const canAnnounce = role !== undefined && can(role, PERMISSIONS.ANNOUNCEMENT_SEND);
  const hasUnread = notifications.some((n) => !n.isRead);

  const open = (n: NotificationDto) => {
    if (!n.isRead) markRead.mutate({ id: n.id });
    const href = deepLinkForType(n.type);
    if (href) router.push(href);
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <PageHeader
        title="Notifications"
        breadcrumb={
          <Link href="/dashboard" className="hover:text-neutral-800">
            ← Dashboard
          </Link>
        }
        action={
          hasUnread ? (
            <Button variant="secondary" onClick={() => markAllRead.mutate()}>
              Mark all read
            </Button>
          ) : null
        }
      />

      {canAnnounce ? <AnnouncementComposer onSent={refresh} /> : null}

      <section className="flex flex-col gap-3">
        {list.isLoading ? (
          <Card>
            <SkeletonText lines={4} />
          </Card>
        ) : notifications.length === 0 ? (
          <Card>
            <EmptyState icon={Bell} title="No notifications" message="You have no notifications." />
          </Card>
        ) : (
          notifications.map((n) => (
            <Card key={n.id} className="flex items-start gap-3">
              <span className="mt-1.5 w-2">
                {!n.isRead ? <span className="block size-2 rounded-full bg-primary-600" /> : null}
              </span>
              <button
                type="button"
                onClick={() => open(n)}
                className="flex-1 cursor-pointer text-left"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={n.isRead ? "text-neutral-800" : "font-semibold text-neutral-900"}
                  >
                    {n.title}
                  </span>
                  {!n.isRead ? <Badge tone="info">New</Badge> : null}
                </span>
                <span className="block text-sm text-neutral-500">{n.body}</span>
                <span className="block text-caption text-neutral-500">{timeAgo(n.createdAt)}</span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Archive"
                onClick={() => archive.mutate({ id: n.id })}
              >
                Archive
              </Button>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}

const PRIORITIES: readonly NotificationPriorityKey[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

/** Admin composer — bulk (whole school) or one section. */
function AnnouncementComposer({ onSent }: { onSent: () => void }) {
  const { show } = useToast();
  const [scope, setScope] = useState<"SCHOOL" | "SECTION">("SCHOOL");
  const [classId, setClassId] = useState<string>();
  const [sectionId, setSectionId] = useState<string>();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<NotificationPriorityKey>("NORMAL");
  const [sent, setSent] = useState<number | null>(null);
  const bodyId = useId();

  const classes = trpc.class.list.useQuery();
  const sections = trpc.section.list.useQuery({ classId: classId! }, { enabled: !!classId });

  const create = trpc.notification.createAnnouncement.useMutation({
    onSuccess: (res) => {
      setSent(res.recipientCount);
      setTitle("");
      setBody("");
      onSent();
      show(
        "success",
        `Sent to ${res.recipientCount} recipient${res.recipientCount === 1 ? "" : "s"}.`,
      );
    },
    onError: (e) => show("error", e.message),
  });

  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (scope === "SCHOOL" || !!sectionId) &&
    !create.isPending;

  const submit = () => {
    setSent(null);
    create.mutate({
      scope,
      title: title.trim(),
      body: body.trim(),
      priority,
      ...(scope === "SECTION" && sectionId ? { sectionId } : {}),
    });
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-title text-neutral-900">New announcement</h2>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Audience"
          value={scope}
          onChange={(e) => setScope(e.target.value as "SCHOOL" | "SECTION")}
        >
          <option value="SCHOOL">Whole school (all parents &amp; teachers)</option>
          <option value="SECTION">One section</option>
        </Select>

        {scope === "SECTION" ? (
          <>
            <Select
              label="Class"
              value={classId ?? ""}
              onChange={(e) => {
                setClassId(e.target.value || undefined);
                setSectionId(undefined);
              }}
            >
              <option value="">Select…</option>
              {(classes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label="Section"
              value={sectionId ?? ""}
              onChange={(e) => setSectionId(e.target.value || undefined)}
              disabled={!classId}
            >
              <option value="">Select…</option>
              {(sections.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </>
        ) : null}

        <Select
          label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as NotificationPriorityKey)}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
      </div>

      <Input
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        placeholder="Announcement title"
      />
      <Field label="Message" htmlFor={bodyId}>
        <textarea
          id={bodyId}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={3}
          className={textareaClass}
          placeholder="What do you want to tell them?"
        />
      </Field>

      {create.isError ? <p className="text-sm text-danger-600">{create.error.message}</p> : null}
      {sent !== null ? (
        <p className="text-sm text-success-700">
          Sent to {sent} recipient{sent === 1 ? "" : "s"}.
        </p>
      ) : null}

      <div>
        <Button loading={create.isPending} disabled={!canSubmit} onClick={submit}>
          Send announcement
        </Button>
      </div>
    </Card>
  );
}
