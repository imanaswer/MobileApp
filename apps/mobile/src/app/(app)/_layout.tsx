import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { useAttendanceSync } from "../../lib/attendance-sync";
import { usePushRegistration } from "../../lib/push";
import { trpc } from "../../lib/trpc";
import { useAuthStore } from "../../stores/auth-store";

/** Protected app group — requires a signed-in, activated account. */
export default function AppLayout() {
  const status = useAuthStore((state) => state.status);

  if (status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }
  return <ActivationGate />;
}

/**
 * Resolves the DB profile (`auth.me`) and, on first sign-in, activates an INVITED
 * account (`auth.registerProfile`) before rendering the app shell. A signed-in
 * Supabase user with no profile is surfaced as "not set up".
 */
function ActivationGate() {
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const register = trpc.auth.registerProfile.useMutation({
    onSuccess: () => {
      void utils.auth.me.invalidate();
    },
  });

  useEffect(() => {
    if (me.data?.status === "INVITED" && register.isIdle) {
      register.mutate();
    }
  }, [me.data?.status, register]);

  if (me.isError) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-center text-destructive">
          Your account isn’t set up yet. Please contact the school office.
        </Text>
      </View>
    );
  }

  if (me.isLoading || me.data?.status !== "ACTIVE" || register.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <PushRegistrar />
      <AttendanceSyncRunner />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

/** Registers this device for push once the session is signed-in and ACTIVE. */
function PushRegistrar(): null {
  usePushRegistration();
  return null;
}

/** Drains the offline attendance queue on reconnect/foreground while signed in. */
function AttendanceSyncRunner(): null {
  useAttendanceSync();
  return null;
}
