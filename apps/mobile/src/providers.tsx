import { LocaleProvider } from "@repo/i18n";
import { ThemeProvider } from "@repo/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { createTrpcClient, trpc } from "./lib/trpc";
import { useAuthStore } from "./stores/auth-store";

/** App-wide providers: tRPC + TanStack Query + theme/locale, and auth restore. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createTrpcClient());
  const initialize = useAuthStore((state) => state.initialize);

  // Restore the session and subscribe once; cleanup unsubscribes.
  useEffect(() => initialize(), [initialize]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LocaleFromProfile>{children}</LocaleFromProfile>
        </ThemeProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

/** Wire LocaleProvider to the signed-in user's locale (F8); "en" until loaded / signed out. */
function LocaleFromProfile({ children }: { children: ReactNode }) {
  const me = trpc.auth.me.useQuery();
  return <LocaleProvider locale={me.data?.locale ?? "en"}>{children}</LocaleProvider>;
}
