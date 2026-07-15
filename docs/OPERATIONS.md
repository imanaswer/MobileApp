# Operations (M17 / ADR-025 §3, §4, §9)

Day-2 operations: monitoring, logging, and the Super-Admin ops tools. Backup/restore/DR
live in **`BACKUP.md`**; deployment in **`DEPLOYMENT.md`**.

## Monitoring endpoints
- `GET /api/health` — liveness (`{ status, version, uptime, environment, timezone, time }`),
  dependency-free, always 200. Wire uptime monitors + the container `HEALTHCHECK` here.
- `GET /api/ready` — readiness (DB + storage); **503** when a dependency is down. Load
  balancers / deploy smoke checks gate on this.

## Structured logging (ADR-025 §3)
One JSON line per request to stdout/stderr — scrape it with the platform log collector.
Fields: `timestamp, level, requestId, userId, schoolId, route, durationMs, status, error, stack`.
Levels INFO (success) / ERROR (failure) / WARN. Logger: `packages/core/src/logger.ts`; the
transport middleware is in `packages/api/src/trpc.ts`. An inbound `x-request-id` (from a
proxy/LB) is honored for cross-service correlation. No tokens/PII/request bodies are logged.

## Super-Admin ops tools (`system:manage`, SUPER_ADMIN only)
tRPC procedures under `system.*` — read-only / non-destructive, no business data modified:

| Procedure | Purpose |
|---|---|
| `system.diagnostics` | version / uptime / environment + DB readiness |
| `system.auditExport` | keyset-paginated audit-log export (tenant-scoped, ADR-007) — `{ limit, before? }` |
| `system.storageCheck` | verifies each private bucket is reachable |
| `system.cacheClear` | clears the in-process rate-limit cache (e.g. to lift a wrongly rate-limited admin) |

Authorization is enforced in the business layer (`services/system/system-ops.ts`); OFFICE_ADMIN
is **not** granted `system:manage`. No web/mobile ops UI ships in M17 — these are called via an
authenticated Super-Admin client. Adding a `/admin/ops` console is a future UI task.

## Common tasks
- **Investigate an error:** find the `requestId` in the client/500, grep the JSON logs for it —
  `route`, `userId`, `schoolId`, `status`, `stack` pin the failure.
- **Rate-limit a caller is stuck:** `system.cacheClear` resets all counters (per-process).
- **Audit who did what:** `system.auditExport` (or query `AuditLog` directly with service-role).
- **Storage looks wrong:** `system.storageCheck` confirms bucket reachability; provisioning is
  `RUNBOOK_SUPABASE_SETUP.md §3b–3e`.

## Push delivery (operational notes / tracking)
- **Fire-and-forget dispatch:** `dispatchPushToUsers` is a floating promise by design —
  fine for the Docker deploy (long-lived Node process). **If this app ever moves to a
  serverless host (Vercel/Lambda), wire Next's `after()` around the dispatch at the API
  layer** or pushes will be silently dropped when the function freezes. Tracked in the
  `ponytail:` comment in `packages/business/src/services/notification/push.ts`.
- **Receipt polling not implemented:** Expo reports some failures (e.g. an iOS token
  revoked at Apple) only via the *receipts* API ~15 min after send; those tokens are
  currently never pruned (only `DeviceNotRegistered` at send-time is, finding B13).
  Symptom: stale device rows accumulate; cost is a few wasted sends per stale device.
  Upgrade path: a `system.pushReceiptSweep` ops procedure (store ticket ids at send,
  poll `getPushNotificationReceiptsAsync`, prune on terminal errors) run manually or
  via cron. Tracked in the adapter comment (`packages/notifications`).

## Rate limiting (operational note)
In-memory, **per-process** (`packages/api/src/rate-limit.ts`) — correct for the single web
container M17 deploys. If scaled horizontally, the effective limit multiplies by instance
count; move the store to Redis/Upstash then (the documented upgrade path).
