import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AttendanceStatusKey } from "@repo/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Offline Layer 2 (OFFLINE_STRATEGY §Layer-2) — queued attendance writes that
 * survive app restarts and drain on reconnect.
 *
 * DEVIATION FROM THE DOC: the strategy's `(divisionId, dateIST, period)` /
 * `markBulk` / `[enrollmentId, date, period]` model does NOT exist in this
 * codebase. The real register is an `AttendanceSession` addressed by `sessionId`
 * (resolved from sectionId + date + sessionType), saved via `attendance.mark`,
 * upsert on `(sessionId, enrollmentId)`. So we coalesce per **sessionId** — one
 * pending entry per register, re-editing replaces it (matches upsert semantics,
 * no replay-ordering problem, exactly the doc's intent on the real schema).
 */

export type QueueEntryState = "PENDING" | "SYNCING" | "FAILED";

export interface QueuedAttendance {
  /** Client-side key for list rendering / dedup (server idempotency is the upsert). */
  id: string;
  /** Actor who queued this. Drain refuses entries whose userId ≠ current signed-in
   *  user, so a queued write never POSTs under a different teacher's token (§Auth). */
  userId: string;
  /** Real coalescing key — the register this batch belongs to. */
  sessionId: string;
  /** For roster-cache invalidation + display. */
  sectionId: string;
  dateIST: string;
  marks: { enrollmentId: string; status: AttendanceStatusKey; remarks?: string }[];
  /** Device time, display only (server time is authoritative for audit). */
  queuedAt: string;
  attempts: number;
  state: QueueEntryState;
  /** Terminal-failure reason (FORBIDDEN/BAD_REQUEST) surfaced to the teacher. */
  reason?: string;
}

export interface EnqueueInput {
  userId: string;
  sessionId: string;
  sectionId: string;
  dateIST: string;
  marks: QueuedAttendance["marks"];
}

interface OfflineQueueStore {
  queue: QueuedAttendance[];
  /** Bumped to poke the drain effect (manual retry while already online). Not persisted. */
  syncNonce: number;
  /** Coalesce per sessionId — replace any existing entry for the same register. */
  enqueue: (input: EnqueueInput) => void;
  setEntryState: (id: string, state: QueueEntryState, reason?: string) => void;
  incrementAttempts: (id: string) => void;
  remove: (id: string) => void;
  /** FAILED/PENDING → PENDING, clears reason, and pokes the drain. */
  retry: (id: string) => void;
  discard: (id: string) => void;
  /** Ask the drain to run now (e.g. after a manual retry while online). */
  requestSync: () => void;
  /** Logout / different user — never drain another user's writes (§Auth). */
  purge: () => void;
}

const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useOfflineQueueStore = create<OfflineQueueStore>()(
  persist(
    (set) => ({
      queue: [],
      syncNonce: 0,
      enqueue: (input) =>
        set((s) => ({
          queue: [
            ...s.queue.filter((e) => e.sessionId !== input.sessionId),
            {
              ...input,
              id: newId(),
              queuedAt: new Date().toISOString(),
              attempts: 0,
              state: "PENDING" as const,
            },
          ],
        })),
      setEntryState: (id, state, reason) =>
        set((s) => ({
          queue: s.queue.map((e) =>
            e.id === id ? { ...e, state, ...(reason !== undefined ? { reason } : {}) } : e,
          ),
        })),
      incrementAttempts: (id) =>
        set((s) => ({
          queue: s.queue.map((e) => (e.id === id ? { ...e, attempts: e.attempts + 1 } : e)),
        })),
      remove: (id) => set((s) => ({ queue: s.queue.filter((e) => e.id !== id) })),
      retry: (id) =>
        set((s) => ({
          syncNonce: s.syncNonce + 1,
          queue: s.queue.map((e) =>
            e.id === id ? { ...e, state: "PENDING" as const, reason: undefined } : e,
          ),
        })),
      discard: (id) => set((s) => ({ queue: s.queue.filter((e) => e.id !== id) })),
      requestSync: () => set((s) => ({ syncNonce: s.syncNonce + 1 })),
      purge: () => set({ queue: [] }),
    }),
    {
      name: "offline-attendance-queue",
      storage: createJSONStorage(() => AsyncStorage),
      // Persist only the queue — the nonce is a transient in-session trigger.
      partialize: (s) => ({ queue: s.queue }),
    },
  ),
);
