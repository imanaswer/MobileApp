# State Management Plan — School Management Portal

How state is owned across web and mobile. Extends CODING_STANDARDS §7/8 (TanStack Query for server state, Zustand for client state, RHF+Zod for forms) into concrete rules.

## 1. State taxonomy — who owns what

| Kind | Owner | Examples |
|---|---|---|
| Server state | **TanStack Query** (only) | rosters, attendance, marks, homework, threads, flags, profile |
| Session/identity | Supabase client session + `auth.me` query | JWT, Principal-derived profile |
| Global client state | **Zustand** (small, few stores) | active child (`activeStudentId`), locale (mirror of profile), UI shell state |
| Ephemeral UI state | component `useState` | open sheets, input focus, steppers |
| Form state | **React Hook Form** + shared Zod schema | all create/edit forms |
| Offline queue (`offline` flag) | dedicated persisted store (see OFFLINE_STRATEGY) | pending attendance mutations |

Rules: never copy server data into Zustand; never fetch outside Query. If it came from the API, Query owns it.

## 2. Query key conventions

Hierarchical arrays, scope-first — enables prefix invalidation:

```
['students', 'list', { filters }]
['student', studentId]
['attendance', divisionId, dateISO, period]
['attendance-summary', studentId, { range }]
['marks', examId, divisionId]
['homework', divisionId, { cursor }]
['leave', 'mine', studentId] / ['leave', 'approvals', divisionId]
['threads'] / ['messages', threadId]
['notifications'] / ['flags'] / ['me']
```

Parent-scoped keys **always include `activeStudentId`** — switching children never shows stale other-child data.

## 3. Cache policy (staleTime)

| Data | staleTime | Rationale |
|---|---|---|
| `flags`, academic structure, grade scales | 1h + invalidate on mutation | changes rarely |
| `me`, profile | 15m | |
| Rosters/enrollment | 15m | |
| Attendance (today, teacher view) | 0 | correctness over chatter |
| Attendance summary, marks, homework, notices | 5m | |
| Messages/notifications | 30s + refetch on focus/push | near-real-time feel without sockets |

Push notifications carry `dataJson.link` + entity hints → on receipt, invalidate the matching keys (e.g. new message → `['messages', threadId]`).

## 4. Mutations

1. **Optimistic** (API_CONVENTIONS §9): attendance marking, read receipts, notification read, flag toggle. Pattern: `onMutate` snapshot → `onError` rollback + toast → `onSettled` invalidate.
2. **Pessimistic (pending state)**: marks, money, roles/permissions, promotion, leave decisions — server confirmation required.
3. Conflict: marks carry `updatedAt`; `CONFLICT` → refetch + show merge toast, never silent overwrite.
4. Invalidation map lives beside each mutation hook (e.g. `leave.decide` → invalidate `['leave', …]`, `['attendance', division…]`, `['notifications']`).

## 5. Zustand stores (complete list — resist adding more)

| Store | Fields | Persisted? |
|---|---|---|
| `useSessionStore` | hydration status, signOut action (clears everything) | no (Supabase persists its own session) |
| `useChildStore` (mobile parent) | `activeStudentId`, setter | yes — device storage |
| `useUiStore` | sidebar collapsed (web), active sheet ids | no |
| `useOfflineQueueStore` (flag) | queued mutations, sync status | yes — see OFFLINE_STRATEGY |

Locale: source of truth is `User.locale` (server). Device stores last-known for pre-auth boot (welcome screen); after login the profile wins.

## 6. Persistence (mobile)

- TanStack Query persister → AsyncStorage (or MMKV if perf demands), `maxAge` 24h, **whitelist read-mostly keys**: rosters, homework, notices, attendance summaries, child profile, timetable.
- Never persist: messages (privacy), signed URLs (expire), money/fees state, audit.
- Cache buster: persister key includes app version + userId; logout purges.

## 7. Forms

- RHF + `zodResolver` with the **same schema** from `packages/validation` the router uses — client and server can't drift.
- Server field errors (`fieldErrors` in `error.data`, API_CONVENTIONS §6) map back via `setError`.
- Multi-step wizards (import, promotion) keep step state in the wizard component (or a local reducer), validated per step; nothing global.

## 8. Session lifecycle

1. Boot: restore Supabase session → `auth.me` → route by role (NAVIGATION_MAP guards).
2. Token refresh: Supabase client auto-refresh; tRPC links attach the current access token per request.
3. 401 from API → attempt refresh once → sign-out on failure.
4. DISABLED user → API rejects at Principal build → client force-signs-out (F14).
5. Logout: deregister device token → clear Query cache + persister → reset Zustand stores.

## 9. Testing

Hooks with mocked tRPC client (msw or direct mock); optimistic flows tested for rollback; child-switcher tested for key isolation (child A data never rendered under child B).
