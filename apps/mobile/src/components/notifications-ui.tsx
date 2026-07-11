import type { NotificationTypeKey } from "@repo/types";
import { Link, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { trpc } from "../lib/trpc";

/**
 * Map a notification TYPE to the mobile destination SCREEN for its recipient
 * (M10, ADR-018 Step 7). Mobile detail routes are studentId-keyed, so a
 * notification routes to the right *section* of the app, not the raw entity —
 * which is the reachable, role-correct destination for the recipient. Types
 * without a dedicated screen (announcement / system / study material) don't
 * navigate; the inbox row is enough.
 */
export function deepLinkForType(type: NotificationTypeKey): Href | null {
  switch (type) {
    case "HOMEWORK":
    case "HOMEWORK_PUBLISHED":
      return "/homework";
    case "REPORT_CARD_PUBLISHED":
      return "/report-cards/children";
    case "EXAM_PUBLISHED":
      return "/exam/markable";
    case "TIMETABLE_UPDATED":
      return "/timetable";
    default:
      return null;
  }
}

/** Relative time, coarse (inbox rows). */
export function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Bell + unread badge for the home header; links to the inbox (every role has one). */
export function NotificationBell() {
  const unread = trpc.notification.unreadCount.useQuery();
  const count = unread.data ?? 0;
  return (
    <Link href="/notifications" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <Text className="text-2xl">🔔</Text>
        {count > 0 ? (
          <View className="absolute right-0 top-1 min-w-5 items-center justify-center rounded-full bg-destructive px-1">
            <Text className="text-xs font-semibold text-destructive-foreground">
              {count > 99 ? "99+" : count}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}
