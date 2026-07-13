import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useOfflineQueueStore } from "../stores/offline-queue-store";

/**
 * Offline Layer 2 UI contract (§Layer-2). A badge with the pending/failed count on
 * the teacher Home + attendance screens; tap to see each queued register with its
 * failure reason and per-entry Retry / Discard. Retry works on PENDING too (so a
 * transient failure while online is manually re-drainable), never silently dropped.
 */
export function SyncQueueIndicator(): React.JSX.Element | null {
  const queue = useOfflineQueueStore((s) => s.queue);
  const retry = useOfflineQueueStore((s) => s.retry);
  const discard = useOfflineQueueStore((s) => s.discard);
  const [open, setOpen] = useState(false);

  if (queue.length === 0) {
    return null;
  }

  const failed = queue.filter((e) => e.state === "FAILED").length;
  const pending = queue.length - failed;
  const tone = failed > 0 ? "text-destructive" : "text-info";

  return (
    <View className="rounded-md border border-border bg-card">
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((v) => !v)}
        className="min-h-11 flex-row items-center justify-between px-3 py-2"
      >
        <Text className={`text-sm font-medium ${tone}`}>
          {failed > 0
            ? `${failed} register${failed > 1 ? "s" : ""} need review`
            : `${pending} register${pending > 1 ? "s" : ""} waiting to sync`}
        </Text>
        <Text className="text-sm text-muted-foreground">{open ? "Hide" : "View"}</Text>
      </Pressable>

      {open
        ? queue.map((entry) => (
            <View key={entry.id} className="border-t border-border px-3 py-2">
              <Text className="text-sm font-medium text-foreground">
                {entry.dateIST} · {entry.marks.length} student
                {entry.marks.length > 1 ? "s" : ""} · {entry.state}
              </Text>
              {entry.reason ? (
                <Text className="mt-1 text-xs text-destructive">{entry.reason}</Text>
              ) : null}
              {entry.state !== "SYNCING" ? (
                <View className="mt-2 flex-row gap-3">
                  <Pressable accessibilityRole="button" onPress={() => retry(entry.id)}>
                    <Text className="text-sm font-medium text-primary">Retry</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => discard(entry.id)}>
                    <Text className="text-sm font-medium text-destructive">Discard</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        : null}
    </View>
  );
}
