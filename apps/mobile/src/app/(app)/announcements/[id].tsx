import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import {
  AttachmentList,
  formatDate,
  Loading,
  SCOPE_LABEL,
  STATUS_LABEL,
} from "../../../components/announcements-ui";
import { trpc } from "../../../lib/trpc";

/**
 * Announcement detail (M11 Step 6). View title/body/scope + attachment downloads.
 * Author actions are permission + lifecycle gated: publish/archive are admin-only;
 * edit/delete apply to a DRAFT the author owns (the service is the real gate).
 */
export default function AnnouncementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const role = trpc.auth.me.useQuery().data?.role;
  const canManage = role !== undefined && can(role, PERMISSIONS.ANNOUNCEMENT_MANAGE);
  const canDraft = role !== undefined && can(role, PERMISSIONS.ANNOUNCEMENT_DRAFT);

  const query = trpc.announcement.get.useQuery({ id }, { enabled: !!id });
  const a = query.data;
  const download = trpc.announcement.attachmentDownloadUrl.useMutation();

  const refresh = () => {
    void utils.announcement.list.invalidate();
    void utils.announcement.get.invalidate({ id });
  };
  const publish = trpc.announcement.publish.useMutation({ onSuccess: refresh });
  const archive = trpc.announcement.archive.useMutation({ onSuccess: refresh });
  const remove = trpc.announcement.delete.useMutation({
    onSuccess: () => {
      void utils.announcement.list.invalidate();
      router.back();
    },
  });

  if (query.isLoading || !a) {
    return (
      <View className="flex-1 bg-background">
        <Header onBack={() => router.back()} />
        <Loading />
      </View>
    );
  }

  const isDraft = a.status === "DRAFT";
  const isPublished = a.status === "PUBLISHED";
  const canEdit = isDraft && (canManage || canDraft);

  const confirmDelete = () =>
    Alert.alert("Delete draft?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate({ id }) },
    ]);

  return (
    <View className="flex-1 bg-background">
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerClassName="p-4 gap-4">
        <View className="gap-1">
          <Text className="text-2xl font-semibold text-foreground">{a.title}</Text>
          <Text className="text-xs text-muted-foreground">
            {SCOPE_LABEL[a.scope]} · {STATUS_LABEL[a.status]} ·{" "}
            {formatDate(a.publishedAt ?? a.createdAt)}
          </Text>
        </View>

        <Text className="text-base leading-6 text-foreground">{a.body}</Text>

        <AttachmentList
          attachments={a.attachments}
          onMint={(attachmentId) => download.mutateAsync({ attachmentId })}
        />

        <View className="gap-2 pt-2">
          {canEdit ? (
            <Action label="Edit draft" onPress={() => router.push(`/announcements/new?id=${id}`)} />
          ) : null}
          {isDraft && canManage ? (
            <Action label="Publish" primary onPress={() => publish.mutate({ id })} />
          ) : null}
          {isPublished && canManage ? (
            <Action label="Archive" onPress={() => archive.mutate({ id })} />
          ) : null}
          {canEdit ? <Action label="Delete draft" destructive onPress={confirmDelete} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        className="min-h-11 min-w-11 items-center justify-center rounded-md"
      >
        <Text className="text-lg text-foreground">←</Text>
      </Pressable>
      <Text className="flex-1 text-xl font-semibold text-foreground">Announcement</Text>
    </View>
  );
}

function Action({
  label,
  onPress,
  primary,
  destructive,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  destructive?: boolean;
}) {
  const tone = primary
    ? "bg-primary"
    : destructive
      ? "border border-destructive bg-background"
      : "border border-border bg-background";
  const text = primary
    ? "text-primary-foreground"
    : destructive
      ? "text-destructive"
      : "text-foreground";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-11 items-center justify-center rounded-md px-4 py-3 ${tone}`}
    >
      <Text className={`font-medium ${text}`}>{label}</Text>
    </Pressable>
  );
}
