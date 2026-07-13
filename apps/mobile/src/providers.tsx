import { LocaleProvider } from "@repo/i18n";
import { ThemeProvider } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import { useEffect, useState, type ReactNode } from "react";

import {
  asyncStoragePersister,
  createQueryClient,
  DAY_MS,
  shouldPersistQuery,
} from "./lib/query-client";
import { createTrpcClient, trpc } from "./lib/trpc";
import { useAuthStore } from "./stores/auth-store";

// Cache buster — bumping the app version invalidates the whole persisted read cache.
const appVersion = Constants.expoConfig?.version ?? "0";

/** App-wide providers: tRPC + persisted TanStack Query + theme/locale, and auth restore. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());
  const [trpcClient] = useState(() => createTrpcClient());
  const initialize = useAuthStore((state) => state.initialize);

  // Restore the session and subscribe once; cleanup unsubscribes.
  useEffect(() => initialize(), [initialize]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: asyncStoragePersister,
          maxAge: DAY_MS,
          buster: appVersion,
          // Only cache successful reads on the allowlist (STATE_MANAGEMENT_PLAN §6).
          dehydrateOptions: {
            shouldDehydrateQuery: (q) => q.state.status === "success" && shouldPersistQuery(q),
          },
        }}
      >
        <ThemeProvider>
          <CacheOnLogout />
          <LocaleFromProfile>{children}</LocaleFromProfile>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </trpc.Provider>
  );
}

/** Purge the persisted read cache on sign-out — no user's data lingers for the next
 *  (STATE_MANAGEMENT_PLAN §6 L71; complements the offline-queue purge in auth-store). */
function CacheOnLogout(): null {
  const status = useAuthStore((s) => s.status);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (status === "signedOut") {
      queryClient.clear();
      void asyncStoragePersister.removeClient();
    }
  }, [status, queryClient]);
  return null;
}

/** Wire LocaleProvider to the signed-in user's locale (F8); "en" until loaded / signed out. */
function LocaleFromProfile({ children }: { children: ReactNode }) {
  const me = trpc.auth.me.useQuery();
  return <LocaleProvider locale={me.data?.locale ?? "en"}>{children}</LocaleProvider>;
}
