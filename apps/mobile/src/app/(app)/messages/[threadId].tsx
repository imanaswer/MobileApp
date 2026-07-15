import { useTranslation } from "@repo/i18n";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { trpc } from "../../../lib/trpc";

/**
 * A conversation (M18). Messages arrive newest-first from the server; the inverted
 * FlatList renders them newest-at-bottom. The other party's unread messages are
 * flipped read on mount. Header labels come from the list row's nav params — a deep
 * link falls back to a generic title.
 */
export default function ConversationScreen() {
  const { dict } = useTranslation();
  const t = dict.messages;
  const router = useRouter();
  const { threadId, name, student } = useLocalSearchParams<{
    threadId: string;
    name?: string;
    student?: string;
  }>();
  const myUserId = trpc.auth.me.useQuery().data?.userId;
  const utils = trpc.useUtils();

  // Modest poll so the counterparty's reply appears while the conversation is open.
  const query = trpc.message.threadMessages.useQuery(
    { threadId },
    { enabled: !!threadId, refetchInterval: 15_000 },
  );
  const messages = query.data?.items ?? []; // newest-first, matches inverted list

  // Flip incoming messages to read whenever a NEW one arrives (poll), not just on
  // mount — keeps the home/list unread badges honest while the thread is open.
  const latestIncomingId = messages.find((m) => m.senderUserId !== myUserId)?.id;
  const markRead = trpc.message.markRead.useMutation({
    onSuccess: () => void utils.message.unreadCount.invalidate(),
  });
  useEffect(() => {
    if (threadId) markRead.mutate({ threadId });
  }, [threadId, latestIncomingId]);

  const [body, setBody] = useState("");
  const send = trpc.message.send.useMutation({
    onSuccess: () => {
      setBody("");
      void utils.message.threadMessages.invalidate({ threadId });
      void utils.message.listThreads.invalidate();
    },
  });

  const submit = () => {
    const trimmed = body.trim();
    if (trimmed.length === 0 || send.isPending) return;
    send.mutate({ threadId, body: trimmed });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <View className="border-b border-border px-4 py-3">
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.goBack}
            onPress={() => router.back()}
            className="min-h-11 min-w-11 items-center justify-center rounded-md"
          >
            <Text className="text-lg text-foreground">←</Text>
          </Pressable>
          <Text className="flex-1 text-xl font-semibold text-foreground" numberOfLines={1}>
            {name || t.conversation}
          </Text>
        </View>
        {student ? (
          <Text className="ml-14 text-xs text-muted-foreground">{t.about(student)}</Text>
        ) : null}
      </View>

      <FlatList
        inverted
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4 gap-2"
        ListEmptyComponent={
          query.isLoading ? null : <Text className="text-muted-foreground">{t.noMessages}</Text>
        }
        renderItem={({ item }) => {
          const mine = item.senderUserId === myUserId;
          return (
            <View className={mine ? "items-end" : "items-start"}>
              <View
                className={`max-w-[80%] rounded-lg px-3 py-2 ${
                  mine ? "bg-primary" : "border border-border bg-card"
                }`}
              >
                <Text className={mine ? "text-primary-foreground" : "text-foreground"}>
                  {item.body}
                </Text>
                <Text
                  className={`mt-1 text-xs ${
                    mine ? "text-primary-foreground/70" : "text-muted-foreground"
                  }`}
                >
                  {new Date(item.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          );
        }}
      />

      <View className="flex-row items-end gap-2 border-t border-border p-3">
        <TextInput
          className="min-h-11 flex-1 rounded-md border border-border bg-card px-3 py-2 text-foreground"
          value={body}
          placeholder={t.writeMessage}
          accessibilityLabel={t.writeMessage}
          multiline
          onChangeText={setBody}
        />
        <Pressable
          accessibilityRole="button"
          disabled={body.trim().length === 0 || send.isPending}
          onPress={submit}
          className={`min-h-11 justify-center rounded-md px-4 ${
            body.trim().length > 0 && !send.isPending ? "bg-primary" : "bg-muted"
          }`}
        >
          <Text className="font-medium text-primary-foreground">{t.send}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
