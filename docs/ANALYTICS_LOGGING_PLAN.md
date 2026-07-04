# Analytics & Logging Plan — School Management Portal

Observability stack per Dev PRD §3/§10: **PostHog** (product analytics), **Sentry** (errors, web + mobile + server), structured server logs. This plan defines what is captured, how it's named, and the privacy lines that must not be crossed. Distinct from `AuditLog` (ADR-007): audit is the **legal/dispute record** in Postgres; analytics/logging are **operational** and disposable.

## 1. Privacy rules (DPDP — minors' data; non-negotiable)

1. **Never send to PostHog/Sentry/logs:** student names, DOB, photos, phone numbers, emails, addresses, marks values, attendance statuses per student, message/homework/announcement content, OTPs, tokens, signed URLs.
2. Identify users by **opaque `userId`** (the UID) + `role` + `locale` only. Student references only as opaque ids, and only where operationally necessary.
3. Sentry: `sendDefaultPii: false`; scrub request bodies; breadcrumbs exclude input values; URLs with ids are acceptable (opaque cuids).
4. IP anonymization on in PostHog; EU/India data-residency setting per what PostHog offers at setup; retention ≤ 12 months.
5. Consent posture follows the client's DPDP stance **[CONFIRM §16.9]** — analytics must be degradable to off (env kill-switch `POSTHOG_DISABLED`) without code change.

## 2. PostHog — event taxonomy

Naming: `domain_action` (snake_case, past tense). Super-properties on every event: `role`, `platform` (web|android|ios), `locale`, `app_version`. No student-identifying properties.

| Event | Properties | Why |
|---|---|---|
| `auth_signed_in` | method (otp/password) | adoption |
| `auth_otp_failed` | reason (throttled/invalid) | onboarding friction |
| `attendance_marked` | division_size_bucket, duration_ms, mode (daily/period), offline (bool) | the <60s KPI (§8.4) |
| `attendance_sync_completed` | queued_count, failed_count | offline health |
| `marks_entered` | subject_count, row_count, duration_ms | teacher effort |
| `reportcard_generated` | scope (single/bulk), duration_ms | PDF perf budget |
| `homework_posted` | has_attachments | usage |
| `leave_applied` / `leave_decided` | decision, hours_to_decision | workflow health |
| `announcement_published` | scope | usage |
| `message_sent` | — | usage |
| `import_completed` | total, success, error rows, duration_ms | import quality (risk §11) |
| `fee_payment_completed` (`fees`) | amount_bucket, method | conversion (no exact amounts) |
| `notification_opened` | type | push effectiveness |
| `locale_changed` | to | ml adoption |
| `screen_viewed` (autocapture/manual) | screen_id | navigation reality vs design |

KPI dashboards: parent WAU/MAU + % Malayalam; attendance marking p50/p95 duration; absence-push → open rate; import error rate; leave decision latency; crash-free sessions (Sentry).

## 3. Sentry

- **Projects:** `web` (Next.js — client + server via `@sentry/nextjs`), `mobile` (`sentry-expo`), one DSN each; environment tag dev/staging/prod (`APP_ENV`).
- **Releases:** web = git SHA (Vercel); mobile = `app_version+eas_build`; **sourcemaps uploaded in CI** for both; OTA updates tagged so JS-only releases are distinguishable.
- **Traces:** tRPC middleware wraps every procedure → span per `router.procedure`, tagged `userId`/`role` (no PII); sample 10% prod, 100% staging. Slow-query breadcrumbs from Prisma middleware (query shape, not values).
- **Alerts:** new issue in prod → team channel; error-rate spike on `fees.*` or `auth.*` → page; cron-job failure (see §5) → alert.
- Client errors: rollback toasts report handled errors with `level: warning`; unhandled → error.

## 4. Structured server logs

- JSON lines via a thin logger in `packages/utils` (pino-compatible shape): `{ ts, level, requestId, userId?, role?, procedure, durationMs, code? }`.
- One log line per tRPC call (info on success, warn on expected errors — FORBIDDEN/NOT_FOUND, error on 5xx). **No input payloads logged** (PII rule). RequestId propagates to Sentry.
- Vercel log drain optional post-go-live; default = Vercel's retention.

## 5. Scheduled jobs & webhooks observability

- Every cron run writes a heartbeat log `{ job, ranAt, processed, skipped, failed }`; absence job additionally records "notified count" so "did parents get pinged today?" is answerable in one query.
- Missed-run detection: a lightweight check (e.g. cron-job status query or dead-man's-snitch style ping) alerts if the absence job hasn't run by cutoff+30m.
- Razorpay webhook: log verified/rejected signatures (rejected → Sentry warning with orderId only).

## 6. What lives where (decision table)

| Question | Source |
|---|---|
| "Who changed this mark?" | **AuditLog** (in-app viewer) |
| "Why did this request fail?" | Sentry + server logs |
| "Are teachers actually using mobile attendance?" | PostHog |
| "Did the absence job run today?" | job heartbeat log/alert |
| "Is Malayalam adoption growing?" | PostHog `locale` property |

## 7. Milestone rollout

M0/M1 (already scoped): Sentry both apps + env plumbing. M2+: `screen_viewed`, auth + import events with each feature. M3: attendance timing events (the KPI needs baseline data from day one of staging). Go-live: dashboards + alerts reviewed as a go-live checklist item (DoD milestone gate).
