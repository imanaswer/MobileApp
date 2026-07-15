import { useTranslation } from "@repo/i18n";
import type { MessageThreadDto } from "@repo/types";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { formatDate } from "../../../components/announcements-ui";
import { trpc } from "../../../lib/trpc";

/**
 * Teacher ↔ parent messaging (M18). The caller's threads (newest-active first) plus a
 * "New message" composer. A row resolves its counterparty name via
 * `message.counterparties(studentId)` — the only way to name the other party — and
 * degrades to a role label if that student has since left scope. Never cached offline.
 */
export default function MessagesScreen() {
  const { dict } = useTranslation();
  const t = dict.messages;
  const router = useRouter();
  const myUserId = trpc.auth.me.useQuery().data?.userId;
  // Modest poll so a reply shows up without a manual reopen (no realtime yet).
  const list = trpc.message.listThreads.useQuery({}, { refetchInterval: 20_000 });
  const students = trpc.student.list.useQuery();
  const studentName = useMemo(
    () => new Map((students.data ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName}`])),
    [students.data],
  );
  const [composing, setComposing] = useState(false);

  if (composing) {
    return (
      <View className="flex-1 bg-background">
        <Header title={t.newMessage} onBack={() => setComposing(false)} />
        <Composer studentName={studentName} onClose={() => setComposing(false)} />
      </View>
    );
  }

  const rows = list.data?.items ?? [];

  const open = (thread: MessageThreadDto, name: string) =>
    router.push({
      pathname: "/messages/[threadId]",
      params: {
        threadId: thread.id,
        name,
        student: studentName.get(thread.studentId) ?? "",
      },
    });

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.goBack}
          onPress={() => router.back()}
          className="min-h-11 min-w-11 items-center justify-center rounded-md"
        >
          <Text className="text-lg text-foreground">←</Text>
        </Pressable>
        <Text className="flex-1 text-xl font-semibold text-foreground">{t.title}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setComposing(true)}
          className="min-h-11 justify-center rounded-md bg-primary px-3"
        >
          <Text className="font-medium text-primary-foreground">{t.newMessage}</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4 gap-3"
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} />
        }
        ListEmptyComponent={
          list.isLoading ? null : <Text className="text-muted-foreground">{t.noConversations}</Text>
        }
        renderItem={({ item }) => (
          <ThreadRow
            thread={item}
            studentLabel={studentName.get(item.studentId) ?? t.student}
            myUserId={myUserId}
            onOpen={(name) => open(item, name)}
          />
        )}
      />
    </View>
  );
}

/** One thread row; resolves the counterparty's name (role-label fallback on scope loss). */
function ThreadRow({
  thread,
  studentLabel,
  myUserId,
  onOpen,
}: {
  thread: MessageThreadDto;
  studentLabel: string;
  myUserId: string | undefined;
  onOpen: (counterpartyName: string) => void;
}) {
  const { dict } = useTranslation();
  const t = dict.messages;
  const iAmStaff = thread.staffUserId === myUserId;
  const counterpartyUserId = iAmStaff ? thread.guardianUserId : thread.staffUserId;
  const cps = trpc.message.counterparties.useQuery(
    { studentId: thread.studentId },
    { retry: false },
  );
  const resolved = cps.data?.find((c) => c.userId === counterpartyUserId)?.name;
  const name = resolved ?? (iAmStaff ? t.parentFallback : t.teacherFallback);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(name)}
      className="flex-row items-center gap-3 rounded-md border border-border bg-card p-4"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-foreground" numberOfLines={1}>
          <Text className="font-semibold">{name}</Text>
          <Text className="text-muted-foreground"> · {studentLabel}</Text>
        </Text>
        {thread.lastMessagePreview ? (
          <Text
            numberOfLines={1}
            className={
              thread.unreadCount > 0
                ? "text-sm font-medium text-foreground"
                : "text-sm text-muted-foreground"
            }
          >
            {thread.lastMessagePreview}
          </Text>
        ) : null}
      </View>
      {thread.unreadCount > 0 ? (
        <View
          accessibilityLabel={t.unreadBadge(thread.unreadCount)}
          className="rounded-full bg-primary px-2 py-0.5"
        >
          <Text className="text-xs font-semibold text-primary-foreground">
            {thread.unreadCount}
          </Text>
        </View>
      ) : null}
      <Text className="text-xs text-muted-foreground">{formatDate(thread.lastMessageAt)}</Text>
    </Pressable>
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
  const { dict } = useTranslation();
  const t = dict.messages;
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [otherUserId, setOtherUserId] = useState("");

  const counterparties = trpc.message.counterparties.useQuery(
    { studentId },
    { enabled: !!studentId, retry: false },
  );
  const create = trpc.message.createThread.useMutation({
    onSuccess: (thread) => {
      const name = counterparties.data?.find((c) => c.userId === otherUserId)?.name ?? "";
      onClose();
      router.push({
        pathname: "/messages/[threadId]",
        params: {
          threadId: thread.id,
          name,
          student: studentName.get(thread.studentId) ?? "",
        },
      });
    },
  });

  const students = [...studentName.entries()];
  const recipients = counterparties.data ?? [];

  return (
    <ScrollView contentContainerClassName="p-4 gap-4">
      <View className="gap-2">
        <Text className="text-sm font-medium text-muted-foreground">{t.student}</Text>
        <View className="flex-row flex-wrap gap-2">
          {students.map(([id, name]) => (
            <Chip
              key={id}
              label={name}
              active={studentId === id}
              onPress={() => {
                setStudentId(id);
                setOtherUserId("");
              }}
            />
          ))}
        </View>
      </View>

      {studentId ? (
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">{t.recipient}</Text>
          {counterparties.isLoading ? (
            <Text className="text-sm text-muted-foreground">{dict.common.loading}</Text>
          ) : recipients.length === 0 ? (
            <Text className="text-sm text-muted-foreground">{t.noRecipients}</Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {recipients.map((c) => (
                <Chip
                  key={c.userId}
                  label={c.name}
                  active={otherUserId === c.userId}
                  onPress={() => setOtherUserId(c.userId)}
                />
              ))}
            </View>
          )}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={!studentId || !otherUserId || create.isPending}
        onPress={() => create.mutate({ studentId, otherUserId })}
        className={`min-h-11 items-center justify-center rounded-md px-4 py-3 ${
          studentId && otherUserId && !create.isPending ? "bg-primary" : "bg-muted"
        }`}
      >
        <Text className="font-medium text-primary-foreground">{t.startConversation}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const { dict } = useTranslation();
  return (
    <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dict.messages.goBack}
        onPress={onBack}
        className="min-h-11 min-w-11 items-center justify-center rounded-md"
      >
        <Text className="text-lg text-foreground">←</Text>
      </Pressable>
      <Text className="flex-1 text-xl font-semibold text-foreground">{title}</Text>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`min-h-11 justify-center rounded-md px-3 ${
        active ? "bg-primary" : "border border-border bg-background"
      }`}
    >
      <Text className={active ? "text-primary-foreground" : "text-foreground"}>{label}</Text>
    </Pressable>
  );
}
