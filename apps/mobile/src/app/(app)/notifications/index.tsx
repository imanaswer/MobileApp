import type { NotificationDto } from "@repo/types";
import { useRouter, type Href } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { deepLinkForType, timeAgo } from "../../../components/notifications-ui";
import { trpc } from "../../../lib/trpc";

/**
 * Notification inbox (M10, ADR-018 Step 7). The caller's own live notifications
 * (`notification.list`), newest first. Pull to refresh; tapping a row marks it read
 * and deep-links to its destination screen; each row can be archived. "Mark all
 * read" clears the badge. All mutations invalidate the list + unread count.
 */
export default function NotificationsScreen() {
  const router = useRouter();
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

  const hasUnread = notifications.some((n) => !n.isRead);

  const open = (n: NotificationDto) => {
    if (!n.isRead) {
      markRead.mutate({ id: n.id });
    }
    // Prefer the event's own deep link (M11 announcements carry /announcements/:id);
    // fall back to the type default (M10).
    const href = (n.actionUrl as Href | null) ?? deepLinkForType(n.type);
    if (href) {
      router.push(href);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            router.back();
          }}
          className="min-h-11 min-w-11 items-center justify-center rounded-md"
        >
          <Text className="text-lg text-foreground">←</Text>
        </Pressable>
        <Text className="flex-1 text-xl font-semibold text-foreground">Notifications</Text>
        {hasUnread ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => markAllRead.mutate()}
            className="min-h-11 justify-center rounded-md px-2"
          >
            <Text className="font-medium text-primary">Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {list.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerClassName="p-4 gap-3"
          refreshControl={
            <RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} />
          }
          ListEmptyComponent={
            <Text className="text-muted-foreground">You have no notifications.</Text>
          }
          renderItem={({ item }) => (
            <NotificationRow
              item={item}
              onOpen={() => open(item)}
              onArchive={() => archive.mutate({ id: item.id })}
            />
          )}
        />
      )}
    </View>
  );
}

function NotificationRow({
  item,
  onOpen,
  onArchive,
}: {
  item: NotificationDto;
  onOpen: () => void;
  onArchive: () => void;
}) {
  return (
    <View className="flex-row items-start gap-3 rounded-md border border-border bg-card p-4">
      <View className="mt-1 w-2">
        {!item.isRead ? <View className="h-2 w-2 rounded-full bg-primary" /> : null}
      </View>
      <Pressable accessibilityRole="button" onPress={onOpen} className="flex-1 gap-1">
        <Text className={item.isRead ? "text-foreground" : "font-semibold text-foreground"}>
          {item.title}
        </Text>
        <Text className="text-sm text-muted-foreground">{item.body}</Text>
        <Text className="text-xs text-muted-foreground">{timeAgo(item.createdAt)}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Archive"
        onPress={onArchive}
        className="min-h-11 justify-center px-1"
      >
        <Text className="text-sm text-muted-foreground">Archive</Text>
      </Pressable>
    </View>
  );
}
