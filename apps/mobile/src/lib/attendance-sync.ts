import { TRPCClientError } from "@trpc/client";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useOfflineQueueStore, type QueuedAttendance } from "../stores/offline-queue-store";

import { trpc, trpcClient } from "./trpc";
import { useIsOnline } from "./use-online";

/** tRPC codes that mean "this will never succeed on replay" — surface, don't retry. */
const TERMINAL_CODES = new Set(["FORBIDDEN", "BAD_REQUEST", "NOT_FOUND", "CONFLICT"]);

function errorCode(err: unknown): string | undefined {
  if (err instanceof TRPCClientError) {
    return (err.data as { code?: string } | undefined)?.code;
  }
  return undefined;
}

/**
 * Offline Layer 2 drain (§Layer-2 sync protocol). Replays queued attendance through
 * the SAME `attendance.mark` procedure (idempotent upsert) — oldest-first, serially,
 * one register at a time. Triggered on reconnect and app-foreground; no background
 * sync while killed (a non-goal).
 *
 * ponytail: retry-on-reconnect/foreground instead of the doc's 1m/5m/15m timer
 * ladder — "never silently dropped" is preserved (entries stay PENDING and the
 * SyncQueueIndicator offers manual retry). Add the timer ladder if weak-signal
 * churn proves it necessary.
 */
export function useAttendanceSync(): void {
  const online = useIsOnline();
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const userId = me.data?.userId;
  // Re-fires the drain on manual retry while already online (no connectivity edge).
  const syncNonce = useOfflineQueueStore((s) => s.syncNonce);
  const draining = useRef(false);

  useEffect(() => {
    if (!online || !userId) {
      return;
    }

    async function drainOne(entry: QueuedAttendance): Promise<void> {
      useOfflineQueueStore.getState().setEntryState(entry.id, "SYNCING");
      try {
        await trpcClient.attendance.mark.mutate({ sessionId: entry.sessionId, marks: entry.marks });
        useOfflineQueueStore.getState().remove(entry.id);
        void utils.attendance.roster.invalidate();
        void utils.attendance.summary.invalidate();
      } catch (err) {
        const code = errorCode(err);
        if (code === "UNAUTHORIZED") {
          // Token expired mid-drain — pause; leave PENDING for the next trigger (§Auth).
          useOfflineQueueStore.getState().setEntryState(entry.id, "PENDING");
          throw err;
        }
        if (code && TERMINAL_CODES.has(code)) {
          useOfflineQueueStore.getState().setEntryState(entry.id, "FAILED", terminalReason(code));
          return;
        }
        // Retryable (network / 5xx) — keep PENDING, count the attempt, try next trigger.
        useOfflineQueueStore.getState().incrementAttempts(entry.id);
        useOfflineQueueStore.getState().setEntryState(entry.id, "PENDING");
        throw err;
      }
    }

    async function drain(): Promise<void> {
      if (draining.current) {
        return;
      }
      draining.current = true;
      try {
        // Only the CURRENT user's PENDING entries — never POST under a different actor.
        for (;;) {
          const next = useOfflineQueueStore
            .getState()
            .queue.filter((e) => e.userId === userId && e.state === "PENDING")
            .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))[0];
          if (!next) {
            break;
          }
          try {
            await drainOne(next);
          } catch {
            // Transport/auth failure — stop this pass; a later trigger resumes.
            break;
          }
        }
      } finally {
        draining.current = false;
      }
    }

    void drain();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        void drain();
      }
    });
    return () => sub.remove();
  }, [online, userId, utils, syncNonce]);
}

function terminalReason(code: string): string {
  switch (code) {
    case "FORBIDDEN":
      return "Your assignment to this class changed — you can no longer save this register.";
    case "BAD_REQUEST":
      return "A student is no longer active in this class.";
    case "NOT_FOUND":
      return "This register no longer exists.";
    default:
      return "This register could not be saved and needs review.";
  }
}
