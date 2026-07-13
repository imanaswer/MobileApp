import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/** Reactive online state from react-query's `onlineManager` (fed by NetInfo). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}
