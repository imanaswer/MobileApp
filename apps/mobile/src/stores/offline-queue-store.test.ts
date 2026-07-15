import { beforeEach, describe, expect, it, vi } from "vitest";

// The store persists via AsyncStorage (native module) — stub it for node.
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

import { useOfflineQueueStore, type EnqueueInput } from "./offline-queue-store";

const entry = (over: Partial<EnqueueInput> = {}): EnqueueInput => ({
  userId: "teacher-1",
  sessionId: "session-1",
  sectionId: "section-1",
  dateIST: "2026-07-15",
  marks: [{ enrollmentId: "enr-1", status: "PRESENT" }],
  ...over,
});

describe("offline queue store", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ queue: [], syncNonce: 0 });
  });

  it("coalesces per sessionId — re-editing a register replaces its pending entry", () => {
    const s = useOfflineQueueStore.getState();
    s.enqueue(entry());
    s.enqueue(entry({ marks: [{ enrollmentId: "enr-1", status: "ABSENT" }] }));
    s.enqueue(entry({ sessionId: "session-2" }));

    const queue = useOfflineQueueStore.getState().queue;
    expect(queue).toHaveLength(2);
    expect(queue.find((e) => e.sessionId === "session-1")?.marks[0]?.status).toBe("ABSENT");
  });

  it("purgeUser discards only that user's entries (logout confirm), keeping others", () => {
    const s = useOfflineQueueStore.getState();
    s.enqueue(entry());
    s.enqueue(entry({ sessionId: "session-2", userId: "teacher-2" }));

    useOfflineQueueStore.getState().purgeUser("teacher-1");

    const queue = useOfflineQueueStore.getState().queue;
    expect(queue).toHaveLength(1);
    expect(queue[0]?.userId).toBe("teacher-2");
  });

  it("retry re-arms a FAILED entry and pokes the drain", () => {
    useOfflineQueueStore.getState().enqueue(entry());
    const id = useOfflineQueueStore.getState().queue[0]!.id;
    useOfflineQueueStore.getState().setEntryState(id, "FAILED", "nope");

    useOfflineQueueStore.getState().retry(id);

    const after = useOfflineQueueStore.getState();
    expect(after.queue[0]?.state).toBe("PENDING");
    expect(after.queue[0]?.reason).toBeUndefined();
    expect(after.syncNonce).toBe(1);
  });
});
