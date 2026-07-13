import type { HomeworkChildContextDto } from "@repo/types";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { ScreenScaffold } from "../../../components/attendance-ui";
import { AttachmentList, HW_STATUS_LABEL, SUB_STATUS_LABEL } from "../../../components/homework-ui";
import {
  pickDocument,
  pickImage,
  uploadSubmissionFile,
  type AttachmentMeta,
  type PickedFile,
} from "../../../lib/attachments";
import { trpc } from "../../../lib/trpc";

/**
 * Homework detail (M6, mobile), role-aware. Teacher/admin: lifecycle actions
 * (publish/close/reopen/delete) + a link to the review queue. Parent: teacher files
 * + a per-child submit/resubmit (note-only on mobile — files on web) with a link to
 * each submission's feedback. Attachments open via a signed URL.
 */
export default function HomeworkDetailScreen() {
  const { homeworkId } = useLocalSearchParams<{ homeworkId: string }>();
  const id = homeworkId ?? "";
  const me = trpc.auth.me.useQuery();
  const isParent = me.data?.role === "PARENT";

  const hw = trpc.homework.get.useQuery({ homeworkId: id }, { enabled: id !== "" });
  const attachments = trpc.homework.attachments.useQuery(
    { homeworkId: id },
    { enabled: id !== "" },
  );
  const dl = trpc.homework.attachmentDownloadUrl.useMutation();

  if (hw.isLoading) {
    return (
      <ScreenScaffold title="Homework">
        <ActivityIndicator />
      </ScreenScaffold>
    );
  }
  if (hw.data === undefined) {
    return (
      <ScreenScaffold title="Homework">
        <Text className="text-muted-foreground">Homework not found.</Text>
      </ScreenScaffold>
    );
  }
  const h = hw.data;

  return (
    <ScreenScaffold title="Homework">
      <View className="gap-1 rounded-md border border-border bg-card p-4">
        <Text className="text-lg font-semibold text-foreground">{h.title}</Text>
        <Text className="text-sm text-muted-foreground">
          Due {h.dueDate} · {HW_STATUS_LABEL[h.status]}
        </Text>
        {h.description ? <Text className="mt-2 text-foreground">{h.description}</Text> : null}
      </View>

      <Text className="text-sm font-medium text-muted-foreground">Teacher files</Text>
      <AttachmentList
        attachments={attachments.data ?? []}
        onMint={(attachmentId) => dl.mutateAsync({ attachmentId })}
        emptyHint="No files attached."
      />

      {isParent ? (
        <ParentSubmit homeworkId={id} canSubmit={h.status === "PUBLISHED"} />
      ) : (
        <TeacherActions homeworkId={id} status={h.status} />
      )}
    </ScreenScaffold>
  );
}

function TeacherActions({ homeworkId, status }: { homeworkId: string; status: string }) {
  const utils = trpc.useUtils();
  const [reason, setReason] = useState("");
  const invalidate = () => {
    void utils.homework.get.invalidate({ homeworkId });
    void utils.homework.list.invalidate();
  };
  const publish = trpc.homework.publish.useMutation({ onSuccess: invalidate });
  const close = trpc.homework.close.useMutation({ onSuccess: invalidate });
  const reopen = trpc.homework.reopen.useMutation({ onSuccess: invalidate });
  const remove = trpc.homework.delete.useMutation({ onSuccess: invalidate });
  const err = publish.error ?? close.error ?? reopen.error ?? remove.error;

  return (
    <View className="gap-2">
      <Link
        href={{ pathname: "/homework/[homeworkId]/submissions", params: { homeworkId } }}
        asChild
      >
        <Pressable
          accessibilityRole="button"
          className="min-h-11 items-center justify-center rounded-md border border-border px-4 py-3"
        >
          <Text className="font-medium text-foreground">Review submissions</Text>
        </Pressable>
      </Link>

      {status === "DRAFT" ? (
        <>
          <ActionButton
            label="Publish"
            primary
            pending={publish.isPending}
            onPress={() => publish.mutate({ homeworkId })}
          />
          <ActionButton
            label="Delete draft"
            destructive
            pending={remove.isPending}
            onPress={() => remove.mutate({ homeworkId })}
          />
        </>
      ) : null}
      {status === "PUBLISHED" ? (
        <ActionButton
          label="Close"
          pending={close.isPending}
          onPress={() => close.mutate({ homeworkId })}
        />
      ) : null}
      {status === "CLOSED" ? (
        <>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Reason to reopen"
            className="min-h-11 rounded-md border border-border px-3 text-foreground"
          />
          <ActionButton
            label="Reopen"
            pending={reopen.isPending}
            disabled={reason.trim() === ""}
            onPress={() => reopen.mutate({ homeworkId, reason: reason.trim() })}
          />
        </>
      ) : null}
      {err ? <Text className="text-sm text-destructive">{err.message}</Text> : null}
    </View>
  );
}

function ParentSubmit({ homeworkId, canSubmit }: { homeworkId: string; canSubmit: boolean }) {
  const ctxQuery = trpc.submission.childContext.useQuery({ homeworkId });
  const rows = ctxQuery.data ?? [];

  if (ctxQuery.isLoading) {
    return <ActivityIndicator />;
  }
  if (rows.length === 0) {
    return <Text className="text-muted-foreground">This homework isn’t for your children.</Text>;
  }
  return (
    <View className="gap-3">
      {rows.map((row) => (
        <ChildSubmitCard
          key={row.studentId}
          homeworkId={homeworkId}
          row={row}
          canSubmit={canSubmit}
        />
      ))}
    </View>
  );
}

function ChildSubmitCard({
  homeworkId,
  row,
  canSubmit,
}: {
  homeworkId: string;
  row: HomeworkChildContextDto;
  canSubmit: boolean;
}) {
  const utils = trpc.useUtils();
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const onDone = () => {
    setNote("");
    setFiles([]);
    void utils.submission.childContext.invalidate({ homeworkId });
  };
  const submit = trpc.submission.submit.useMutation({ onSuccess: onDone });
  const resubmit = trpc.submission.resubmit.useMutation({ onSuccess: onDone });
  const mintUpload = trpc.submission.attachmentUploadUrl.useMutation();
  const sub = row.submission;
  const isResubmit = sub !== null;
  const reviewed = sub?.status === "REVIEWED";
  const attempt = sub ? sub.attempt + 1 : 1;
  const pending = submit.isPending || resubmit.isPending || uploading;
  const err = submit.error ?? resubmit.error;
  // Can act only with an ACTIVE-in-section enrollment, homework PUBLISHED, not yet REVIEWED.
  const actionable = canSubmit && row.enrollmentId !== null && !reviewed;
  // Server rule: a submission needs a note OR at least one attachment.
  const canSend = note.trim() !== "" || files.length > 0;

  const addFile = (pick: () => Promise<PickedFile | null>) => async () => {
    setUploadErr(null);
    try {
      const file = await pick();
      if (file) {
        setFiles((prev) => (prev.length >= 10 ? prev : [...prev, file]));
      }
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Could not add the file");
    }
  };

  const onSend = async () => {
    if (row.enrollmentId === null) {
      return;
    }
    setUploadErr(null);
    let attachments: AttachmentMeta[] = [];
    try {
      setUploading(true);
      attachments = await Promise.all(
        files.map((file) =>
          uploadSubmissionFile(file, (meta) =>
            mintUpload
              .mutateAsync({ homeworkId, enrollmentId: row.enrollmentId!, attempt, ...meta })
              .then((r) => ({ storagePath: r.storagePath, token: r.token })),
          ),
        ),
      );
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "File upload failed");
      return;
    } finally {
      setUploading(false);
    }
    const input = {
      homeworkId,
      enrollmentId: row.enrollmentId,
      note: note.trim() || null,
      attachments,
    };
    if (isResubmit) {
      resubmit.mutate(input);
    } else {
      submit.mutate(input);
    }
  };

  return (
    <View className="gap-2 rounded-md border border-border bg-card p-4">
      <Text className="font-medium text-foreground">{row.studentName}</Text>
      {sub ? (
        <Text className="text-sm text-muted-foreground">
          Attempt {sub.attempt} · {SUB_STATUS_LABEL[sub.status]}
          {sub.isLate ? " · Late" : ""}
        </Text>
      ) : (
        <Text className="text-sm text-muted-foreground">Not submitted yet.</Text>
      )}

      {sub ? (
        <Link
          href={{
            pathname: "/homework/submission/[submissionId]",
            params: { submissionId: sub.id },
          }}
          asChild
        >
          <Pressable accessibilityRole="button" className="min-h-9 justify-center">
            <Text className="text-sm text-primary">View submission &amp; feedback</Text>
          </Pressable>
        </Link>
      ) : null}

      {actionable ? (
        <>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={isResubmit ? "Note for resubmission" : "Add a note"}
            multiline
            className="min-h-16 rounded-md border border-border px-3 py-2 text-foreground"
          />

          {files.map((file, i) => (
            <View
              key={`${file.uri}-${i}`}
              className="flex-row items-center justify-between rounded-md border border-border bg-background px-3 py-2"
            >
              <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                {file.fileName}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={pending}
                onPress={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Text className="text-sm font-medium text-destructive">Remove</Text>
              </Pressable>
            </View>
          ))}

          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              disabled={pending || files.length >= 10}
              onPress={addFile(pickImage)}
              className="min-h-11 flex-1 items-center justify-center rounded-md border border-border px-3 py-2"
            >
              <Text className="text-sm font-medium text-foreground">Add photo</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={pending || files.length >= 10}
              onPress={addFile(pickDocument)}
              className="min-h-11 flex-1 items-center justify-center rounded-md border border-border px-3 py-2"
            >
              <Text className="text-sm font-medium text-foreground">Add file</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={pending || !canSend}
            onPress={() => {
              void onSend();
            }}
            className={`min-h-11 items-center justify-center rounded-md px-4 py-3 ${
              pending || !canSend ? "bg-primary/40" : "bg-primary"
            }`}
          >
            <Text className="font-medium text-primary-foreground">
              {uploading ? "Uploading…" : isResubmit ? "Resubmit" : "Submit"}
            </Text>
          </Pressable>
          <Text className="text-xs text-muted-foreground">
            Add a note or attach up to 10 photos/files.
          </Text>
          {uploadErr ? <Text className="text-sm text-destructive">{uploadErr}</Text> : null}
        </>
      ) : reviewed ? (
        <Text className="text-sm text-success">Reviewed — no further changes.</Text>
      ) : null}
      {err ? <Text className="text-sm text-destructive">{err.message}</Text> : null}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  pending,
  disabled,
  primary,
  destructive,
}: {
  label: string;
  onPress: () => void;
  pending?: boolean;
  disabled?: boolean;
  primary?: boolean;
  destructive?: boolean;
}) {
  const off = pending || disabled;
  const base = primary
    ? off
      ? "bg-primary/40"
      : "bg-primary"
    : destructive
      ? "border border-destructive"
      : "border border-border";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={onPress}
      className={`min-h-11 items-center justify-center rounded-md px-4 py-3 ${base}`}
    >
      <Text
        className={`font-medium ${
          primary ? "text-primary-foreground" : destructive ? "text-destructive" : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
