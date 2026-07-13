import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { onlineManager, QueryClient, type Query } from "@tanstack/react-query";
import superjson from "superjson";

/**
 * Offline Layer 1 (OFFLINE_STRATEGY §Layer-1). Read caching + connectivity
 * awareness so rosters/homework/notices/summaries stay readable offline.
 *
 * `gcTime` is 24h GLOBALLY: react-query only persists queries still in cache at
 * write time, so the "roster prefetch ≥24h" contract needs the cache itself to
 * survive that long (persister maxAge alone is not enough). `staleTime` is left
 * per-query (attendance-today stays 0 → refetches when online, cache used offline).
 */
export const DAY_MS = 1000 * 60 * 60 * 24;

// NetInfo → onlineManager, so paused mutations don't error-spam offline (§Layer-1.8).
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected));
  }),
);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: DAY_MS, retry: 1 },
    },
  });
}

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  // Match the tRPC wire transformer so Dates/etc. round-trip through disk.
  serialize: superjson.stringify,
  deserialize: superjson.parse,
});

/**
 * Persistence allowlist (STATE_MANAGEMENT_PLAN §6 L69/L70). ONLY read-mostly,
 * non-sensitive namespaces are written to disk. Never persisted: money/fees,
 * signed URLs (dedicated `mint*Url` procedures), messages, audit — enforced by a
 * positive router allowlist AND a defensive substring guard on the whole key.
 */
const PERSIST_ROUTERS = new Set([
  "auth", // me (Principal: userId/role/status/locale) — needed to render the shell offline
  "attendance", // roster / summary / findSession (metadata; marks are mutations)
  "homework",
  "announcement",
  "calendar",
  "student", // child profile
  "timetable",
  "academicYear",
]);

const NEVER_PERSIST = /url|mint|download|upload|signed|fee|payment|invoice|audit|message/i;

export function shouldPersistQuery(query: Pick<Query, "queryKey">): boolean {
  const path = query.queryKey[0];
  if (!Array.isArray(path) || typeof path[0] !== "string") {
    return false;
  }
  const segments = path.filter((s): s is string => typeof s === "string");
  if (!PERSIST_ROUTERS.has(segments[0] ?? "")) {
    return false;
  }
  return !segments.some((s) => NEVER_PERSIST.test(s));
}
