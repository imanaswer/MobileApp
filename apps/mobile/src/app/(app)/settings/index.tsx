import { PERMISSIONS } from "@repo/constants";
import type { LocaleCode } from "@repo/constants";
import { can } from "@repo/core";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Field, Header, Loading } from "../../../components/behaviour-ui";
import { trpc } from "../../../lib/trpc";

/**
 * School configuration (M16 Step 6, ADR-024). Everyone sees the branding + current
 * app preferences (read-only). Admins (settings:manage) edit the two phone-relevant
 * defaults — theme + language — inline. School profile / academic / numbering are
 * shown READ-ONLY with a pointer to the web admin console (the M13/M15 mobile-is-
 * lighter precedent — no heavy admin forms on the phone).
 */
type ThemeValue = "light" | "dark" | "system";
const THEMES: { value: ThemeValue; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];
const LANGUAGES: { value: LocaleCode; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ml", label: "Malayalam" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const role = trpc.auth.me.useQuery().data?.role;
  const canManage = role !== undefined && can(role, PERMISSIONS.SETTINGS_MANAGE);

  const pub = trpc.settings.getPublic.useQuery();
  const school = trpc.settings.get.useQuery(undefined, { enabled: canManage });
  const utils = trpc.useUtils();
  const save = trpc.configuration.update.useMutation({
    onSuccess: () => void utils.settings.getPublic.invalidate(),
  });

  const [theme, setTheme] = useState<ThemeValue | null>(null);
  const [language, setLanguage] = useState<LocaleCode | null>(null);

  // Prefill the editors once the current values load (theme is a known enum in the DB).
  useEffect(() => {
    if (pub.data) {
      setTheme((t) => t ?? (pub.data.theme as ThemeValue));
      setLanguage((l) => l ?? pub.data.language);
    }
  }, [pub.data]);

  if (pub.isLoading || !pub.data) {
    return (
      <View className="flex-1 bg-background">
        <Header title="Settings" onBack={() => router.back()} />
        <Loading />
      </View>
    );
  }

  const dirty = theme !== pub.data.theme || language !== pub.data.language;

  return (
    <View className="flex-1 bg-background">
      <Header title="Settings" onBack={() => router.back()} />
      <ScrollView contentContainerClassName="p-4 gap-4">
        <Card title="School">
          <Field label="Name">
            <Text className="text-foreground">{pub.data.branding.displayName ?? "—"}</Text>
          </Field>
        </Card>

        <Card title="App preferences">
          <Field label="Theme">
            {canManage ? (
              <Segmented options={THEMES} value={theme} onChange={setTheme} />
            ) : (
              <Text className="text-foreground">{label(THEMES, pub.data.theme as ThemeValue)}</Text>
            )}
          </Field>
          <Field label="Language">
            {canManage ? (
              <Segmented options={LANGUAGES} value={language} onChange={setLanguage} />
            ) : (
              <Text className="text-foreground">{label(LANGUAGES, pub.data.language)}</Text>
            )}
          </Field>
          {canManage ? (
            <Pressable
              accessibilityRole="button"
              disabled={!dirty || save.isPending}
              onPress={() => {
                if (theme !== null && language !== null) save.mutate({ theme, language });
              }}
              className={`min-h-11 items-center justify-center rounded-md px-4 py-3 ${
                dirty && !save.isPending ? "bg-primary" : "bg-muted"
              }`}
            >
              <Text className="font-medium text-primary-foreground">
                {save.isPending ? "Saving…" : "Save preferences"}
              </Text>
            </Pressable>
          ) : null}
          {save.error ? (
            <Text className="text-sm text-destructive">{save.error.message}</Text>
          ) : null}
        </Card>

        {canManage ? (
          <Card title="School profile">
            <Field label="Principal">
              <Text className="text-foreground">{school.data?.principalName ?? "—"}</Text>
            </Field>
            <Field label="Contact email">
              <Text className="text-foreground">{school.data?.contactEmail ?? "—"}</Text>
            </Field>
            <Field label="Contact phone">
              <Text className="text-foreground">{school.data?.contactPhone ?? "—"}</Text>
            </Field>
            <Field label="Invoice / certificate prefix">
              <Text className="text-foreground">
                {school.data?.invoicePrefix ?? "—"} / {school.data?.certificatePrefix ?? "—"}
              </Text>
            </Field>
            <Text className="px-1 text-xs text-muted-foreground">
              Edit the school profile, academic defaults and numbering on the web admin console.
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function label<T extends string>(options: { value: T; label: string }[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            onPress={() => onChange(o.value)}
            className={`min-h-11 justify-center rounded-md border px-4 py-2 ${
              selected ? "border-primary bg-primary" : "border-border bg-card"
            }`}
          >
            <Text className={selected ? "font-medium text-primary-foreground" : "text-foreground"}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2 rounded-md border border-border bg-card p-4">
      <Text className="text-sm font-medium text-muted-foreground">{title}</Text>
      {children}
    </View>
  );
}
