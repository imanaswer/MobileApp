import type { AttendanceStatusKey } from "@repo/types";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";

import { ListRow } from "../../../../components/academic-list";
import {
  ScreenScaffold,
  StatusPicker,
  STATUS_CLASS,
  STATUS_LABEL,
  todayIst,
} from "../../../../components/attendance-ui";
import { OfflineBanner } from "../../../../components/offline-banner";
import { SyncQueueIndicator } from "../../../../components/sync-queue-indicator";
import { trpc } from "../../../../lib/trpc";
import { useIsOnline } from "../../../../lib/use-online";
import { useOfflineQueueStore } from "../../../../stores/offline-queue-store";

/**
 * Teacher/admin daily register for a section. Resolves today's session (findSession
 * — no side effect), offering "Open register" when none exists. When present and
 * DRAFT, shows the roster with a per-student status picker seeded from the
 * leave-derived defaults; Save upserts, then Submit → Lock walk the ADR-011 state
 * machine. SUBMITTED/LOCKED registers are read-only (change via correction on web).
 */
export default function MarkAttendanceScreen() {
  const { sectionId } = useLocalSearchParams<{ sectionId: string }>();
  const utils = trpc.useUtils();
  const date = todayIst();
  const online = useIsOnline();
  const me = trpc.auth.me.useQuery();
  const enqueue = useOfflineQueueStore((s) => s.enqueue);

  const years = trpc.academicYear.list.useQuery();
  const activeYearId = (years.data ?? []).find((y) => y.status === "ACTIVE")?.id;

  const sessionQuery = trpc.attendance.findSession.useQuery(
    { sectionId: sectionId ?? "", sessionType: "DAILY", date },
    { enabled: sectionId !== undefined && activeYearId !== undefined },
  );
  const session = sessionQuery.data ?? null;

  const roster = trpc.attendance.roster.useQuery(
    { sessionId: session?.id ?? "" },
    { enabled: session !== null },
  );
  const students = trpc.student.list.useQuery();
  const studentName = new Map(
    (students.data ?? []).map((s) => [s.id, `${s.firstName} ${s.lastName}`]),
  );

  const [edits, setEdits] = useState<Record<string, AttendanceStatusKey>>({});

  const openSession = trpc.attendance.openSession.useMutation({
    onSuccess: () => {
      void utils.attendance.findSession.invalidate();
    },
  });
  const mark = trpc.attendance.mark.useMutation({
    onSuccess: () => {
      setEdits({});
      void utils.attendance.roster.invalidate();
    },
  });
  const transition = trpc.attendance.submit.useMutation({
    onSuccess: () => {
      void utils.attendance.findSession.invalidate();
    },
  });
  const lock = trpc.attendance.lock.useMutation({
    onSuccess: () => {
      void utils.attendance.findSession.invalidate();
    },
  });

  if (years.isLoading || (activeYearId !== undefined && sessionQuery.isLoading)) {
    return (
      <ScreenScaffold title="Mark attendance">
        <ActivityIndicator />
      </ScreenScaffold>
    );
  }

  if (activeYearId === undefined) {
    return (
      <ScreenScaffold title="Mark attendance">
        <Text className="text-muted-foreground">No active academic year.</Text>
      </ScreenScaffold>
    );
  }

  if (session === null) {
    return (
      <ScreenScaffold title="Mark attendance">
        <Text className="text-foreground">No register for today yet.</Text>
        <Text className="text-sm text-muted-foreground">{date}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={openSession.isPending}
          onPress={() => {
            if (sectionId === undefined) {
              return;
            }
            openSession.mutate({
              academicYearId: activeYearId,
              sectionId,
              sessionType: "DAILY",
              date,
            });
          }}
          className="min-h-11 items-center justify-center rounded-md bg-primary px-4 py-3"
        >
          <Text className="font-medium text-primary-foreground">Open today’s register</Text>
        </Pressable>
        {openSession.isError ? (
          <Text className="text-sm text-destructive">{openSession.error.message}</Text>
        ) : null}
      </ScreenScaffold>
    );
  }

  const isDraft = session.status === "DRAFT";
  const rows = roster.data ?? [];

  return (
    <ScreenScaffold title="Mark attendance">
      <Text className="text-sm text-muted-foreground">
        {date} · {session.status}
      </Text>
      <OfflineBanner message="Offline — marks are saved on this device and will sync when you reconnect." />
      <SyncQueueIndicator />

      {roster.isLoading ? (
        <ActivityIndicator />
      ) : rows.length === 0 ? (
        <Text className="text-muted-foreground">No active students in this section.</Text>
      ) : (
        rows.map((row) => {
          const status = edits[row.enrollmentId] ?? row.currentStatus ?? row.suggestedStatus;
          return (
            <ListRow key={row.enrollmentId}>
              <Text className="font-medium text-foreground">
                {studentName.get(row.studentId) ?? row.studentId}
                {row.rollNo != null ? ` · Roll ${row.rollNo}` : ""}
              </Text>
              {isDraft ? (
                <StatusPicker
                  value={status}
                  onChange={(next) => {
                    setEdits((prev) => ({ ...prev, [row.enrollmentId]: next }));
                  }}
                />
              ) : (
                <Text className={`text-sm font-medium ${STATUS_CLASS[status]}`}>
                  {STATUS_LABEL[status]}
                </Text>
              )}
            </ListRow>
          );
        })
      )}

      {isDraft && rows.length > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={mark.isPending}
            onPress={() => {
              const marks = rows.map((row) => ({
                enrollmentId: row.enrollmentId,
                status: edits[row.enrollmentId] ?? row.currentStatus ?? row.suggestedStatus,
              }));
              // Offline (§Layer-2): queue on-device and drain later; online: save now.
              if (!online && me.data?.userId) {
                enqueue({
                  userId: me.data.userId,
                  sessionId: session.id,
                  sectionId: session.sectionId,
                  dateIST: date,
                  marks,
                });
                setEdits({});
                return;
              }
              mark.mutate({ sessionId: session.id, marks });
            }}
            className="min-h-11 items-center justify-center rounded-md bg-primary px-4 py-3"
          >
            <Text className="font-medium text-primary-foreground">
              {online ? "Save marks" : "Save (offline)"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={transition.isPending}
            onPress={() => {
              transition.mutate({ sessionId: session.id });
            }}
            className="min-h-11 items-center justify-center rounded-md border border-border px-4 py-3"
          >
            <Text className="font-medium text-foreground">Submit register</Text>
          </Pressable>
        </>
      ) : null}

      {session.status === "SUBMITTED" ? (
        <Pressable
          accessibilityRole="button"
          disabled={lock.isPending}
          onPress={() => {
            lock.mutate({ sessionId: session.id });
          }}
          className="min-h-11 items-center justify-center rounded-md border border-border px-4 py-3"
        >
          <Text className="font-medium text-foreground">Lock register</Text>
        </Pressable>
      ) : null}

      {mark.isError ? <Text className="text-sm text-destructive">{mark.error.message}</Text> : null}
    </ScreenScaffold>
  );
}
