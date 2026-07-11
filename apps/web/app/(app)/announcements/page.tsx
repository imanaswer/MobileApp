"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { AnnouncementScopeKey, AnnouncementStatusKey } from "@repo/types";
import Link from "next/link";
import { useState } from "react";

import {
  destructiveBtn,
  inputClass,
  labelClass,
  outlineBtn,
  primaryBtn,
} from "@/src/components/academic/ui";
import {
  formatDate,
  kb,
  pushAnnouncementFile,
  SCOPE_LABEL,
  STATUS_LABEL,
  validateAnnouncementFile,
} from "@/src/components/announcement/ui";
import { trpc } from "@/src/trpc/react";

const ADMIN_TABS: AnnouncementStatusKey[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
const TEACHER_TABS: AnnouncementStatusKey[] = ["DRAFT", "PUBLISHED"];

/**
 * Announcement console (M11, ADR-019 Step 7). Draft / Published / Archive tabs with a
 * scope filter; a composer creates + edits drafts (attachment uploads while DRAFT) and
 * runs the lifecycle — publish/archive are admin-only, edit/delete apply to a draft the
 * author owns. Thin client over the tRPC surface; the service is the authority.
 */
export default function AnnouncementsPage() {
  const me = trpc.auth.me.useQuery();
  const role = me.data?.role;
  const canManage = role !== undefined && can(role, PERMISSIONS.ANNOUNCEMENT_MANAGE);
  const canDraft = role !== undefined && can(role, PERMISSIONS.ANNOUNCEMENT_DRAFT);
  const isAuthor = canManage || canDraft;
  const tabs = canManage ? ADMIN_TABS : TEACHER_TABS;

  const [tab, setTab] = useState<AnnouncementStatusKey>("PUBLISHED");
  const [scopeFilter, setScopeFilter] = useState<AnnouncementScopeKey | "ALL">("ALL");
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const list = trpc.announcement.list.useQuery({ status: tab });
  const rows = (list.data ?? []).filter((a) => scopeFilter === "ALL" || a.scope === scopeFilter);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-sm text-primary">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">Announcements</h1>
        </div>
        {isAuthor ? (
          <button type="button" className={primaryBtn} onClick={() => setEditing("new")}>
            New announcement
          </button>
        ) : null}
      </header>

      {editing ? (
        <Composer
          id={editing === "new" ? null : editing}
          canManage={canManage}
          onClose={() => setEditing(null)}
          onSaved={() => void list.refetch()}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={tab === t ? primaryBtn : outlineBtn}
            >
              {STATUS_LABEL[t]}
            </button>
          ))}
        </div>
        <select
          className={inputClass}
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value as AnnouncementScopeKey | "ALL")}
        >
          <option value="ALL">All audiences</option>
          {(Object.keys(SCOPE_LABEL) as AnnouncementScopeKey[]).map((s) => (
            <option key={s} value={s}>
              {SCOPE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <section className="flex flex-col gap-2">
        {list.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">No announcements.</p>
        ) : (
          rows.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setEditing(a.id)}
              className="flex flex-col gap-1 rounded-md border border-border bg-card p-4 text-left hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 font-semibold text-foreground">{a.title}</span>
                {a.attachments.length > 0 ? (
                  <span className="text-xs text-muted-foreground">📎 {a.attachments.length}</span>
                ) : null}
              </div>
              <span className="line-clamp-2 text-sm text-muted-foreground">{a.body}</span>
              <span className="text-xs text-muted-foreground">
                {SCOPE_LABEL[a.scope]} · {STATUS_LABEL[a.status]} ·{" "}
                {formatDate(a.publishedAt ?? a.createdAt)}
              </span>
            </button>
          ))
        )}
      </section>
    </main>
  );
}

/** Create (id=null) or edit an announcement; attachments + lifecycle in edit mode. */
function Composer({
  id,
  canManage,
  onClose,
  onSaved,
}: {
  id: string | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const utils = trpc.useUtils();
  const existing = trpc.announcement.get.useQuery({ id: id ?? "" }, { enabled: !!id });
  const a = existing.data;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<AnnouncementScopeKey>(canManage ? "WHOLE_SCHOOL" : "SECTION");
  const [classId, setClassId] = useState<string>();
  const [sectionId, setSectionId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  // Prefill once when the edited row loads.
  if (a && hydratedId !== a.id) {
    setHydratedId(a.id);
    setTitle(a.title);
    setBody(a.body);
    setScope(a.scope);
  }

  const classes = trpc.class.list.useQuery(undefined, { enabled: canManage });
  const sections = trpc.section.list.useQuery(
    { classId: classId ?? "" },
    { enabled: canManage && !!classId },
  );
  const targets = trpc.homework.targets.useQuery(undefined, { enabled: !canManage });
  const teacherSections = [
    ...new Map((targets.data ?? []).map((t) => [t.sectionId, t.sectionName])).entries(),
  ];

  const refresh = () => {
    if (id) void utils.announcement.get.invalidate({ id });
    onSaved();
  };
  const create = trpc.announcement.create.useMutation({
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  const update = trpc.announcement.update.useMutation({
    onSuccess: refresh,
    onError: (e) => setError(e.message),
  });
  const publish = trpc.announcement.publish.useMutation({
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const archive = trpc.announcement.archive.useMutation({
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const remove = trpc.announcement.delete.useMutation({
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const mintUpload = trpc.announcement.attachmentUploadUrl.useMutation();
  const addAttachment = trpc.announcement.attachmentAdd.useMutation({ onSuccess: refresh });
  const removeAttachment = trpc.announcement.attachmentRemove.useMutation({ onSuccess: refresh });
  const download = trpc.announcement.attachmentDownloadUrl.useMutation();

  const targetId = scope === "CLASS" ? classId : scope === "SECTION" ? sectionId : undefined;
  const isDraft = !a || a.status === "DRAFT";
  const canEdit = isDraft;

  const save = () => {
    setError(null);
    if (id) {
      update.mutate({ id, title: title.trim(), body: body.trim() });
    } else {
      create.mutate({
        title: title.trim(),
        body: body.trim(),
        scope,
        ...(targetId ? { targetId } : {}),
      });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file || !id) return;
    setError(null);
    const err = validateAnnouncementFile(file);
    if (err) {
      setError(err);
      return;
    }
    try {
      const { storagePath, token } = await mintUpload.mutateAsync({
        announcementId: id,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      await pushAnnouncementFile(storagePath, token, file);
      await addAttachment.mutateAsync({
        announcementId: id,
        path: storagePath,
        fileName: file.name,
        sizeBytes: file.size,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const valid =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (canManage ? scope !== "SECTION" || !!sectionId : !!sectionId) &&
    (scope !== "CLASS" || !!classId);

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">
          {id ? "Edit announcement" : "New announcement"}
        </h2>
        <button type="button" className={outlineBtn} onClick={onClose}>
          Close
        </button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <label className={labelClass}>
        Title
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canEdit}
        />
      </label>
      <label className={labelClass}>
        Message
        <textarea
          className={`${inputClass} min-h-28`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={!canEdit}
        />
      </label>

      {/* Scope is chosen at creation only. */}
      {!id ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className={labelClass}>
            Audience
            <select
              className={inputClass}
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as AnnouncementScopeKey);
                setClassId(undefined);
                setSectionId(undefined);
              }}
            >
              {canManage ? (
                <>
                  <option value="WHOLE_SCHOOL">Whole school</option>
                  <option value="TEACHERS">Teachers</option>
                  <option value="PARENTS">Parents</option>
                  <option value="CLASS">Class</option>
                  <option value="SECTION">Section</option>
                </>
              ) : (
                <option value="SECTION">Section</option>
              )}
            </select>
          </label>

          {canManage && (scope === "CLASS" || scope === "SECTION") ? (
            <label className={labelClass}>
              Class
              <select
                className={inputClass}
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
              </select>
            </label>
          ) : null}

          {canManage && scope === "SECTION" && classId ? (
            <label className={labelClass}>
              Section
              <select
                className={inputClass}
                value={sectionId ?? ""}
                onChange={(e) => setSectionId(e.target.value || undefined)}
              >
                <option value="">Select…</option>
                {(sections.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {!canManage ? (
            <label className={labelClass}>
              Section
              <select
                className={inputClass}
                value={sectionId ?? ""}
                onChange={(e) => setSectionId(e.target.value || undefined)}
              >
                <option value="">Select…</option>
                {teacherSections.map(([sid, name]) => (
                  <option key={sid} value={sid}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Audience: {SCOPE_LABEL[scope]} (fixed after creation)
        </p>
      )}

      {/* Attachments — DRAFT only, after the row exists. */}
      {id && a && isDraft ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Attachments</span>
          {a.attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                className="flex-1 text-left text-primary underline"
                onClick={() =>
                  void download
                    .mutateAsync({ attachmentId: att.id })
                    .then(({ url }) => window.open(url, "_blank"))
                }
              >
                📎 {att.fileName}
              </button>
              <span className="text-xs text-muted-foreground">{kb(att.sizeBytes)}</span>
              <button
                type="button"
                className="text-xs text-destructive"
                onClick={() => removeAttachment.mutate({ attachmentId: att.id })}
              >
                Remove
              </button>
            </div>
          ))}
          <input
            type="file"
            className="text-sm"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <button type="button" className={primaryBtn} disabled={!valid} onClick={save}>
            {id ? "Save draft" : "Create draft"}
          </button>
        ) : null}
        {id && a?.status === "DRAFT" && canManage ? (
          <button type="button" className={primaryBtn} onClick={() => publish.mutate({ id })}>
            Publish
          </button>
        ) : null}
        {id && a?.status === "PUBLISHED" && canManage ? (
          <button type="button" className={outlineBtn} onClick={() => archive.mutate({ id })}>
            Archive
          </button>
        ) : null}
        {id && a?.status === "DRAFT" ? (
          <button type="button" className={destructiveBtn} onClick={() => remove.mutate({ id })}>
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}
