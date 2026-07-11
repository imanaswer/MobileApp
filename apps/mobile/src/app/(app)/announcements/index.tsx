import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { AnnouncementDto, AnnouncementStatusKey } from "@repo/types";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import {
  formatDate,
  Loading,
  SCOPE_LABEL,
  STATUS_LABEL,
} from "../../../components/announcements-ui";
import { trpc } from "../../../lib/trpc";

/**
 * Announcements feed (M11, ADR-019 Step 6). Everyone sees the PUBLISHED feed
 * (targeting resolved server-side). Authors (admin manage / teacher draft) get a
 * Drafts tab + a New button. Tapping a row opens its detail. Pull to refresh.
 */
export default function AnnouncementsScreen() {
  const router = useRouter();
  const role = trpc.auth.me.useQuery().data?.role;
  const canManage = role !== undefined && can(role, PERMISSIONS.ANNOUNCEMENT_MANAGE);
  const canDraft = role !== undefined && can(role, PERMISSIONS.ANNOUNCEMENT_DRAFT);
  const isAuthor = canManage || canDraft;

  const [tab, setTab] = useState<AnnouncementStatusKey>("PUBLISHED");
  const list = trpc.announcement.list.useQuery({ status: tab });
  const rows = list.data ?? [];

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          className="min-h-11 min-w-11 items-center justify-center rounded-md"
        >
          <Text className="text-lg text-foreground">←</Text>
        </Pressable>
        <Text className="flex-1 text-xl font-semibold text-foreground">Announcements</Text>
        {isAuthor ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/announcements/new")}
            className="min-h-11 justify-center rounded-md bg-primary px-3"
          >
            <Text className="font-medium text-primary-foreground">New</Text>
          </Pressable>
        ) : null}
      </View>

      {isAuthor ? (
        <View className="flex-row gap-2 px-4 py-2">
          {(["PUBLISHED", "DRAFT"] as const).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="button"
              onPress={() => setTab(t)}
              className={`min-h-11 justify-center rounded-md px-3 ${
                tab === t ? "bg-primary" : "border border-border bg-background"
              }`}
            >
              <Text className={tab === t ? "text-primary-foreground" : "text-foreground"}>
                {STATUS_LABEL[t]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {list.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(a) => a.id}
          contentContainerClassName="p-4 gap-3"
          refreshControl={
            <RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} />
          }
          ListEmptyComponent={
            <Text className="text-muted-foreground">
              {tab === "DRAFT" ? "No drafts." : "No announcements yet."}
            </Text>
          }
          renderItem={({ item }) => (
            <Row
              item={item}
              showStatus={isAuthor}
              onOpen={() => router.push(`/announcements/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}

function Row({
  item,
  showStatus,
  onOpen,
}: {
  item: AnnouncementDto;
  showStatus: boolean;
  onOpen: () => void;
}) {
  const when = item.publishedAt ?? item.createdAt;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      className="gap-1 rounded-md border border-border bg-card p-4"
    >
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 font-semibold text-foreground">{item.title}</Text>
        {item.attachments.length > 0 ? <Text className="text-xs">📎</Text> : null}
      </View>
      <Text className="text-sm text-muted-foreground" numberOfLines={2}>
        {item.body}
      </Text>
      <Text className="text-xs text-muted-foreground">
        {SCOPE_LABEL[item.scope]}
        {showStatus ? ` · ${STATUS_LABEL[item.status]}` : ""} · {formatDate(when)}
      </Text>
    </Pressable>
  );
}
