import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { DocumentDto, DocumentTypeKey } from "@repo/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { Header, Loading } from "../../../../components/behaviour-ui";
import {
  DOCUMENT_TYPE_LABEL,
  DocumentStatusText,
  GENERATABLE_TYPES,
} from "../../../../components/documents-ui";
import { trpc } from "../../../../lib/trpc";

/**
 * A student's document center (M15 Step 6). The service scopes + status-filters rows
 * (admin: all; teacher own-section / parent own-child: APPROVED only). Everyone with
 * a file can open it (60s signed URL). Admins (document:manage/approve) generate,
 * approve, archive and delete drafts. Uploads are a web-console action (ADR-023 §3).
 */
export default function StudentDocumentsScreen() {
  const router = useRouter();
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const enabled = !!studentId;
  const utils = trpc.useUtils();

  const role = trpc.auth.me.useQuery().data?.role;
  const canManage = role !== undefined && can(role, PERMISSIONS.DOCUMENT_MANAGE);
  const canApprove = role !== undefined && can(role, PERMISSIONS.DOCUMENT_APPROVE);

  const list = trpc.document.listStudentDocuments.useQuery(
    { studentId: studentId ?? "" },
    { enabled },
  );
  const rows = list.data ?? [];
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => utils.document.listStudentDocuments.invalidate({ studentId });
  const onErr = (e: { message: string }) => setError(e.message);

  const download = trpc.document.downloadUrl.useMutation({ onError: onErr });
  const generate = trpc.document.generate.useMutation({ onSuccess: invalidate, onError: onErr });
  const approve = trpc.document.approve.useMutation({ onSuccess: invalidate, onError: onErr });
  const archive = trpc.document.archive.useMutation({ onSuccess: invalidate, onError: onErr });
  const remove = trpc.document.deleteDraft.useMutation({ onSuccess: invalidate, onError: onErr });

  const open = (id: string) => {
    setError(null);
    void download
      .mutateAsync({ id })
      .then((r) => Linking.openURL(r.url))
      .catch(() => undefined); // onError already surfaced it
  };

  // Group by type (brief: "Grouped by type"), preserving the newest-first order within a group.
  const groups = new Map<DocumentTypeKey, DocumentDto[]>();
  for (const d of rows) {
    const g = groups.get(d.type) ?? [];
    g.push(d);
    groups.set(d.type, g);
  }

  const busy = generate.isPending || approve.isPending || archive.isPending || remove.isPending;

  return (
    <View className="flex-1 bg-background">
      <Header title="Documents" onBack={() => router.back()} />
      {list.isLoading ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerClassName="p-4 gap-4"
          refreshControl={
            <RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} />
          }
        >
          {error ? (
            <Text className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </Text>
          ) : null}

          {canManage ? (
            <View className="gap-2 rounded-md border border-border bg-card p-4">
              <Text className="text-sm font-medium text-muted-foreground">
                Generate a certificate
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {GENERATABLE_TYPES.map((t) => (
                  <Pressable
                    key={t}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      setError(null);
                      generate.mutate({ studentId: studentId ?? "", type: t });
                    }}
                    className="rounded-md border border-border bg-background px-3 py-2"
                  >
                    <Text className="text-xs font-medium text-foreground">
                      {DOCUMENT_TYPE_LABEL[t]}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text className="text-xs text-muted-foreground">
                Generated certificates snapshot the student’s current details. Upload prepared files
                from the web console.
              </Text>
            </View>
          ) : null}

          {rows.length === 0 ? (
            <Text className="text-muted-foreground">No documents yet.</Text>
          ) : (
            [...groups.entries()].map(([type, docs]) => (
              <View key={type} className="gap-2">
                <Text className="text-sm font-semibold text-foreground">
                  {DOCUMENT_TYPE_LABEL[type]}
                </Text>
                {docs.map((d) => (
                  <View key={d.id} className="gap-2 rounded-md border border-border bg-card p-4">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="flex-1 text-foreground" numberOfLines={1}>
                        {d.fileName ?? d.snapshot?.studentName ?? "Certificate"}
                      </Text>
                      <DocumentStatusText status={d.status} />
                    </View>
                    {d.snapshot?.issuedOn ? (
                      <Text className="text-xs text-muted-foreground">
                        Issued {d.snapshot.issuedOn}
                      </Text>
                    ) : null}

                    <View className="flex-row flex-wrap gap-2">
                      {d.hasFile ? (
                        <ActionButton label="Open" onPress={() => open(d.id)} />
                      ) : (
                        <Text className="self-center text-xs text-muted-foreground">
                          No file yet
                        </Text>
                      )}
                      {canApprove && (d.status === "GENERATED" || d.status === "UPLOADED") ? (
                        <ActionButton
                          label="Approve"
                          disabled={busy}
                          onPress={() => approve.mutate({ id: d.id })}
                        />
                      ) : null}
                      {canManage && d.status === "APPROVED" ? (
                        <ActionButton
                          label="Archive"
                          disabled={busy}
                          onPress={() => archive.mutate({ id: d.id })}
                        />
                      ) : null}
                      {canManage && (d.status === "GENERATED" || d.status === "UPLOADED") ? (
                        <ActionButton
                          label="Delete"
                          destructive
                          disabled={busy}
                          onPress={() => remove.mutate({ id: d.id })}
                        />
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  destructive,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-md border px-3 py-2 ${
        destructive ? "border-destructive" : "border-border bg-background"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={`text-xs font-medium ${destructive ? "text-destructive" : "text-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
