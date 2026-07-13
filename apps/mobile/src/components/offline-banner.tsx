import { Text, View } from "react-native";

import { useIsOnline } from "../lib/use-online";

/**
 * Offline Layer 1 (§Layer-1.8). Shown on screens that need freshness; nothing when
 * online. Reads the global `onlineManager` state (NetInfo-fed).
 */
export function OfflineBanner({ message }: { message?: string }): React.JSX.Element | null {
  const online = useIsOnline();
  if (online) {
    return null;
  }
  return (
    <View className="rounded-md border border-border bg-muted px-3 py-2">
      <Text className="text-sm font-medium text-foreground">
        {message ?? "Offline — showing saved data. Changes will sync when you reconnect."}
      </Text>
    </View>
  );
}
