import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { AnnouncementScopeKey } from "@repo/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Loading, SCOPE_LABEL } from "../../../components/announcements-ui";
import { trpc } from "../../../lib/trpc";

const ADMIN_SCOPES: AnnouncementScopeKey[] = ["WHOLE_SCHOOL", "TEACHERS", "PARENTS"];

/**
 * Create / edit an announcement DRAFT (M11 Step 6). Admins pick a school-wide scope
 * (WHOLE_SCHOOL / TEACHERS / PARENTS); teachers author a SECTION draft for one of
 * their sections (SECTION/CLASS targeting is a web-console job otherwise). Edit mode
 * (`?id=`) prefills + updates title/body. Publishing is done from the detail screen.
 */
export default function AnnouncementFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const router = useRouter();
  const utils = trpc.useUtils();
  const role = trpc.auth.me.useQuery().data?.role;
  const canManage = role !== undefined && can(role, PERMISSIONS.ANNOUNCEMENT_MANAGE);

  const existing = trpc.announcement.get.useQuery({ id: id ?? "" }, { enabled: isEdit });
  // Teacher's own sections (reuse the homework assignable targets — same TeacherAssignment source).
  const targets = trpc.homework.targets.useQuery(undefined, { enabled: !canManage });
  const sections = [
    ...new Map((targets.data ?? []).map((t) => [t.sectionId, t.sectionName])).entries(),
  ].map(([sectionId, sectionName]) => ({ sectionId, sectionName }));

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<AnnouncementScopeKey>(canManage ? "WHOLE_SCHOOL" : "SECTION");
  const [targetId, setTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (existing.data) {
      setTitle(existing.data.title);
      setBody(existing.data.body);
      setScope(existing.data.scope);
      setTargetId(existing.data.targetId);
    }
  }, [existing.data]);

  const onDone = () => {
    void utils.announcement.list.invalidate();
    if (isEdit) void utils.announcement.get.invalidate({ id });
    router.back();
  };
  const create = trpc.announcement.create.useMutation({ onSuccess: onDone });
  const update = trpc.announcement.update.useMutation({ onSuccess: onDone });

  const needsSection = !canManage;
  const valid = title.trim().length > 0 && body.trim().length > 0 && (!needsSection || !!targetId);
  const saving = create.isPending || update.isPending;

  const save = () => {
    if (isEdit) {
      update.mutate({ id, title: title.trim(), body: body.trim() });
    } else {
      create.mutate({
        title: title.trim(),
        body: body.trim(),
        scope,
        ...(targetId ? { targetId } : {}),
      });
    }
  };

  if (isEdit && existing.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <Header title="Edit draft" onBack={() => router.back()} />
        <Loading />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Header title={isEdit ? "Edit draft" : "New announcement"} onBack={() => router.back()} />
      <ScrollView contentContainerClassName="p-4 gap-4">
        <Field label="Title">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Announcement title"
            className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </Field>

        <Field label="Message">
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Write the announcement…"
            multiline
            className="min-h-32 rounded-md border border-border bg-background px-3 py-2 text-foreground"
            textAlignVertical="top"
          />
        </Field>

        {/* Scope is fixed once created — only editable while creating. */}
        {!isEdit ? (
          canManage ? (
            <Field label="Audience">
              <View className="flex-row flex-wrap gap-2">
                {ADMIN_SCOPES.map((s) => (
                  <Chip
                    key={s}
                    label={SCOPE_LABEL[s]}
                    active={scope === s}
                    onPress={() => setScope(s)}
                  />
                ))}
              </View>
            </Field>
          ) : (
            <Field label="Section">
              {targets.isLoading ? (
                <Loading />
              ) : sections.length === 0 ? (
                <Text className="text-sm text-muted-foreground">
                  You have no assigned sections to announce to.
                </Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {sections.map((s) => (
                    <Chip
                      key={s.sectionId}
                      label={s.sectionName}
                      active={targetId === s.sectionId}
                      onPress={() => {
                        setScope("SECTION");
                        setTargetId(s.sectionId);
                      }}
                    />
                  ))}
                </View>
              )}
            </Field>
          )
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!valid || saving}
          onPress={save}
          className={`min-h-11 items-center justify-center rounded-md px-4 py-3 ${
            valid && !saving ? "bg-primary" : "bg-muted"
          }`}
        >
          <Text className="font-medium text-primary-foreground">
            {saving ? "Saving…" : isEdit ? "Save draft" : "Create draft"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        className="min-h-11 min-w-11 items-center justify-center rounded-md"
      >
        <Text className="text-lg text-foreground">←</Text>
      </Pressable>
      <Text className="flex-1 text-xl font-semibold text-foreground">{title}</Text>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-11 justify-center rounded-md px-3 ${
        active ? "bg-primary" : "border border-border bg-background"
      }`}
    >
      <Text className={active ? "text-primary-foreground" : "text-foreground"}>{label}</Text>
    </Pressable>
  );
}
