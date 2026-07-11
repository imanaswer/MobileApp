import type {
  AnnouncementAttachmentDto,
  AnnouncementScopeKey,
  AnnouncementStatusKey,
  CalendarEventTypeKey,
} from "@repo/types";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";

export const SCOPE_LABEL: Record<AnnouncementScopeKey, string> = {
  WHOLE_SCHOOL: "Whole school",
  CLASS: "Class",
  SECTION: "Section",
  TEACHERS: "Teachers",
  PARENTS: "Parents",
};

export const STATUS_LABEL: Record<AnnouncementStatusKey, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const EVENT_TYPE_LABEL: Record<CalendarEventTypeKey, string> = {
  HOLIDAY: "Holiday",
  EVENT: "Event",
  EXAM: "Exam",
  MEETING: "Meeting",
  OTHER: "Other",
};

/** YYYY-MM-DD or ISO → a short human date (e.g. "8 Nov 2026"). */
export function formatDate(value: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Attachment list with a signed-URL download (mints on tap, opens the URL). */
export function AttachmentList({
  attachments,
  onMint,
}: {
  attachments: AnnouncementAttachmentDto[];
  onMint: (attachmentId: string) => Promise<{ url: string }>;
}) {
  if (attachments.length === 0) return null;
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-muted-foreground">Attachments</Text>
      {attachments.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          accessibilityLabel={`Download ${a.fileName}`}
          onPress={() => {
            void onMint(a.id).then(({ url }) => Linking.openURL(url));
          }}
          className="min-h-11 flex-row items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
        >
          <Text className="text-base">📎</Text>
          <Text className="flex-1 text-foreground" numberOfLines={1}>
            {a.fileName}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {Math.max(1, Math.round(a.sizeBytes / 1024))} KB
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center py-8">
      <ActivityIndicator />
    </View>
  );
}
