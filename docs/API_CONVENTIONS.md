# API Conventions — School Management Portal

Project-wide standards for the single **tRPC** API shared by web and mobile. These build on Dev PRD §4.2/§4.4/§7, `CODING_STANDARDS.md` §6, and ADR-002. Routers are **transport-only**: validate → authorize → call a `packages/business` service → shape the response.

---

## 1. Router & procedure structure
- **One router per domain**, named by the plural domain noun: `students`, `guardians`, `staff`, `academic`, `enrollment`, `attendance`, `exams`, `homework`, `leave`, `announcements`, `messages`, `notifications`, `profile`, `audit`, `flags`, plus flagged add-ons (`fees`, `timetable`, `analytics`). Matches Dev PRD §7.
- **Procedures are camelCase verbs/verb-phrases.** Sub-namespaces use dot grouping where the PRD already does (`exams.gradeScale.*`, `fees.invoices.*`).
- Every procedure has an explicit **Zod input** (even single-field: `z.object({ id: z.string() })`) and an explicit return type sourced from `packages/types`.

## 2. Naming conventions

### Query naming (read, no side effects → `query`)
| Pattern | Meaning |
|---|---|
| `get` / `getById` | one entity by id; throws `NOT_FOUND` if absent |
| `list` | a bounded or paginated collection (filter/sort/paginate in input) |
| `search` | text/criteria search returning a paginated list |
| `getX` (`getStudent`, `getMarks`) | a specific projection/summary (e.g. `studentSummary`, `results`) |

### Mutation naming (writes → `mutation`)
| Pattern | Meaning |
|---|---|
| `create`, `update`, `archive`/`disable` | standard lifecycle (we **archive**, not hard-delete — see DB conventions) |
| `bulk<Verb>` (`bulkImport`, `markBulk`, `enterMarksBulk`, `promoteBulk`) | batch operations |
| domain verbs (`enroll`, `transfer`, `drop`, `apply`, `decide`, `send`, `markRead`, `registerDevice`, `generateReportCard`, `verifyPayment`) | use the ubiquitous-language verb, not generic CRUD |

Imperative mood, no `do`/`handle` prefixes, no HTTP verbs in names.

## 3. Validation rules
- **All input validated by a shared Zod schema in `packages/validation`** — the *same* schema feeds React Hook Form and bulk-import row validation (DRY).
- Schemas are **strict** (`.strict()`) — unknown keys rejected. Trim/normalize strings; coerce nothing implicitly.
- Validation is the router's only inline logic; never re-validate manually what Zod guarantees. Domain invariants (cross-field/stateful) are checked in the **business service**, not the schema.

## 4. Authentication rules
- The tRPC context verifies the **Supabase JWT** and loads the profile, exposing `{ userId, role, schoolId }` (ADR-001). Unauthenticated calls to a `protectedProcedure` → `UNAUTHORIZED`.
- Almost everything is protected; there is **no public self-signup**. The few unauthenticated calls (if any) use an explicit `publicProcedure`.

## 5. Authorization rules
- **No role gate at transport** (ADR-002 M1 refinement): procedures authenticate (`protectedProcedure`); the **business service** authorizes with **permission** (`assertCan` against `ROLE_PERMISSIONS`) then **scope** (`assertScope` with `ScopeRule` predicates): teacher→assigned divisions/subjects, class-teacher→own division, guardian→linked students, office→school-wide non-destructive, super-admin→all. The role comes from the DB-resolved `Principal`, never the JWT or request context. Failures → `FORBIDDEN`. Full catalog: `docs/PERMISSIONS_MATRIX.md`.
- **Add-on procedures check their `FeatureFlag` first** and return `FORBIDDEN` when off (ADR-006).
- **Sensitive mutations** (marks, attendance, roles/users, enrollment/promotion, money) **write an `AuditLog` row in the same transaction** (ADR-007).
- RLS is **not** the API's authz mechanism — it is defense-in-depth for Storage/direct access (ADR-002/004).

## 6. Error format
- Use **`TRPCError`** with a standard code: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT` (uniqueness/state conflicts), `TOO_MANY_REQUESTS` (throttle), `PRECONDITION_FAILED`, `INTERNAL_SERVER_ERROR`.
- **Two-layer message:** a stable machine `code`/`appCode` for the client to branch on, plus a human message the client **localizes via `packages/i18n` keys** (never ship server-side localized prose as the source of truth).
- **Field errors:** validation failures return Zod's flattened `fieldErrors` in `error.data` so forms can map errors to inputs.
- Never leak stack traces, SQL, or internal ids in messages; log full detail to Sentry server-side.

## 7. Response conventions
- Return **domain DTOs from `packages/types`, never raw Prisma models** — control the shape, omit internal fields, keep the contract stable.
- **Money** = integer minor units (paise). **Timestamps** = UTC ISO strings; the client renders **IST**. Calendar dates (attendance/exam) are date-only.
- Prefer **`null`** for "known absent" in payloads; reserve `undefined` for "field not selected." Collections return `[]`, never `null`.
- List endpoints return `{ items, nextCursor }` (see §8) — never a bare array for paginated data.

## 8. Pagination, filtering, sorting

### Cursor vs offset — standard
- **Cursor pagination is the default** for anything that grows or is user-facing/feed-like (attendance history, messages, notifications, announcements, audit log, marks, search). It is stable under inserts and performant at depth.
- **Offset pagination is allowed only** for small, bounded admin lists where a page-jump UI is required (e.g. a class roster ≤ a few hundred). Document the choice per endpoint.

### Shape
```
input:  { cursor?: string, limit?: number (default 20, max 100),
          filter?: <typed>, sortBy?: <enum>, sortDir?: 'asc' | 'desc' }
output: { items: T[], nextCursor: string | null }   // cursor
        { items: T[], total: number, page, pageSize } // offset (when used)
```
- **Cursor** is opaque to clients (encode the last id, or a composite `sortKey:id` for non-unique sort fields). Always paginate on a **stable, indexed** order.

### Filtering
- Filters are an **explicit, typed object** with **whitelisted fields** — never an arbitrary `where`/raw query from the client. Each filterable field maps to an indexed column or a documented scan.

### Sorting
- `sortBy` is an **enum of allowed fields**; `sortDir` is `asc|desc`. Reject anything off the whitelist. Default sort is documented per endpoint and is index-backed.

## 9. Optimistic update guidelines
- Use TanStack Query optimistic updates where the PRD demands instant feel — primarily **attendance marking** (Dev PRD §8.4) and lightweight toggles (**read receipts**, notification read, flag toggles).
- Pattern: `onMutate` snapshot + apply → `onError` rollback to snapshot → `onSettled` invalidate the affected query keys. Show a non-blocking error toast on rollback.
- **Mutations must be idempotent / upsert-keyed** so a retry after a flaky network can't duplicate (attendance upserts on `[enrollmentId, date, period]`; webhooks idempotent — ADR-007/§8.9).
- **Do not** optimistically update money, marks, or role/permission changes — these require server confirmation; show a pending state instead.
- For concurrent edits to the same row (e.g. marks), use `updatedAt` for conflict detection and surface a `CONFLICT` rather than silently overwriting.
