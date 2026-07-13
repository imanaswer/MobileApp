# Offline Strategy — School Management Portal

Two layers: a **baseline** every build ships (graceful weak-connectivity behaviour — PRD v2 §8 "works on weak connectivity"), and the **`offline` feature flag** (queued offline attendance marking — Dev PRD §8.17). Scope is deliberately narrow: v1 offline **writes** = attendance only.

> **Implemented — Phase 2 (2026-07-13).** Layer 1 fully; Layer 2 for attendance. Two deviations from the design below, both forced by the real schema:
> - **Coalescing key is `sessionId`, not `(divisionId, dateIST, period)`.** `divisionId`/`period`/`markBulk`/`[enrollmentId,date,period]` do not exist in this codebase. The register is an `AttendanceSession` (sectionId + date + sessionType), saved via `attendance.mark`, upsert on `(sessionId, enrollmentId)`. One queue entry per `sessionId` — re-editing replaces it (same upsert intent, no replay-ordering problem).
> - **Layer 2 ships always-on, not behind the `offline` flag.** The mobile client does not consume `flags.*` at all, so gating would mean building flag-consumption infra for one path; per the repo's "no new feature-flag infra without an ADR" rule, the queue is unconditional. Sync is retry-on-reconnect/foreground (not the 1m/5m/15m timer ladder) — entries stay PENDING and are manually retryable, never dropped.
> Files: `apps/mobile/src/lib/{query-client,use-online,attendance-sync}.ts`, `stores/offline-queue-store.ts`, `components/{offline-banner,sync-queue-indicator}.tsx`. Queue keyed to userId + purged on logout (never drains under a different actor). Runtime unverified (no device); typecheck-green.

## Layer 1 — Baseline (core, all builds)

1. **Read caching:** TanStack Query persister on mobile (STATE_MANAGEMENT_PLAN §6) — rosters, homework, notices, summaries, child profile readable from cache when offline (shown with a "last updated" hint where data is time-sensitive).
2. **Connectivity awareness:** NetInfo listener → global `isOnline`; `OfflineBanner` on screens that need freshness; Query `onlineManager` wired so paused mutations don't error-spam.
3. **Failed writes** (outside the flag): normal error + retry toast — no queuing. Idempotent upsert keys already make manual retry safe.
4. **Never cached:** signed URLs, messages, fees/payment state (privacy + expiry, STATE_MANAGEMENT_PLAN §6).

## Layer 2 — `offline` flag: queued attendance

### Queue design

```ts
type QueuedAttendanceMutation = {
  id: string;                 // client uuid (idempotency key)
  divisionId: string;
  dateIST: string;            // 'YYYY-MM-DD'
  period: number;             // 0 or 1..N
  rows: { enrollmentId: string; status: AttendanceStatus; note?: string }[];
  queuedAt: string;           // device time, display only
  attempts: number;
  state: 'PENDING' | 'SYNCING' | 'FAILED';
};
```

- Persisted store (`useOfflineQueueStore`, MMKV/AsyncStorage), survives app restarts.
- **Coalescing:** one entry per `(divisionId, dateIST, period)` — re-editing offline replaces the entry (matches server upsert semantics; no replay ordering problem).
- Roster prefetch: opening a division while online caches the roster ≥24h so offline marking has data.

### Sync protocol

1. Reconnect (NetInfo + app-foreground) → drain queue serially, oldest first.
2. Each entry → `attendance.markBulk` (the **same** procedure as online — no special endpoint; upsert on `[enrollmentId, date, period]` makes replay idempotent).
3. Success → remove entry, invalidate `['attendance', division, date]`.
4. Retryable failure (network/5xx) → backoff (1m, 5m, 15m, then on next reconnect), `attempts++`.
5. Terminal failure (FORBIDDEN — assignment changed; BAD_REQUEST — enrollment no longer active) → `FAILED` with reason; surfaced in `SyncQueueIndicator`; teacher can discard or retry after review. Never silently dropped.

### Conflict policy — last-write-wins + audit (Dev PRD §8.17)

Offline replay overwrites earlier server values via the normal upsert; every changed row writes `AuditLog` (actor = the offline teacher, server timestamp). The audit trail is the recovery mechanism for disputes — e.g. office corrected attendance while the teacher was offline; teacher's later sync wins, audit shows both.

Edge rules:
- **Leave collision:** replayed PRESENT over an approved-leave LEAVE row → LWW applies, audited; the leave itself stays APPROVED (attendance is the operational record; discrepancy is visible in audit). Optional post-core improvement: warn in the response and flag the row in UI.
- **Auth expiry:** sync pauses on 401 until session refresh/sign-in; queue is keyed to userId and cleared if a *different* user signs in.
- **Clock skew:** server time is authoritative everywhere; `queuedAt` is display-only. `dateIST` was chosen by the teacher, so no off-by-one risk from device clocks.
- **Stale roster:** rows for enrollments that changed division/status fail row-level → partial success reported (mirror of import semantics), failed rows listed.

### UI contract

| State | Surface |
|---|---|
| Offline, marking | banner "Offline — will sync"; save button says "Save (offline)" |
| Queue pending | `SyncQueueIndicator` badge (count) on teacher Home + attendance screen |
| Syncing | spinner in indicator |
| Failed entries | indicator turns warning; tap → list with reasons + retry/discard |

## Explicit non-goals (v1)

No offline marks entry, homework posting, leave decisions, or messaging; no multi-device queue merge; no CRDT/merge conflict resolution (LWW is the accepted policy); no background sync while the app is killed (sync on launch/foreground/reconnect only).

## Definition of Done (§8.17 expanded)

- Airplane-mode: mark 40 students, kill app, relaunch offline → queue intact; reconnect → synced, no duplicates (unique key proves it), audit rows present.
- Assignment revoked while offline → entry FAILED with clear reason, other entries unaffected.
- Two edits to the same division/date offline → single coalesced entry, last state wins.
