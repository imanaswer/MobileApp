import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { ToastProvider } from "../components/ui";
import { Providers } from "../providers";
import { useAuthStore } from "../stores/auth-store";

import "../../global.css";

/**
 * Global error screen (ADR-025 §5). expo-router renders this for any uncaught
 * render error in the app, with a `retry` to recover. Exporting `ErrorBoundary`
 * from the root layout is the framework-native hook — no custom class component.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 justify-center gap-4 bg-background p-6">
      <Text className="text-2xl font-semibold text-foreground">Something went wrong</Text>
      <Text className="text-sm text-foreground opacity-70">{error.message}</Text>
      <Pressable
        onPress={retry}
        className="min-h-11 items-center justify-center rounded-md bg-primary px-4 py-3"
      >
        <Text className="font-medium text-primary-foreground">Try again</Text>
      </Pressable>
    </View>
  );
}

/** Splash / gate: show a loader until the session is restored, then the navigator. */
function RootGate() {
  const status = useAuthStore((state) => state.status);

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  // Inter is the one typeface (ADR-UX1 §2). Gate render until the font is loaded
  // so text doesn't flash the system font. Screens apply `font-sans` in Step 4.
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });

  if (!fontsLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Providers>
      <ToastProvider>
        <RootGate />
      </ToastProvider>
    </Providers>
  );
}
