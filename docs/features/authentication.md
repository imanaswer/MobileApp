# Feature — Authentication & Authorization

Feature-specific rules. References the PRD; does not duplicate it.
Spec: Dev PRD v1.3 §4.3–§4.4, §5, §8.1 · ADR-001/002 · `docs/PERMISSIONS_MATRIX.md`.

## Roles & lifecycle
- Roles: `SUPER_ADMIN, OFFICE_ADMIN, TEACHER, PARENT, ACCOUNTANT` (fixed; `@repo/constants`). No STUDENT login; class-teacher is an assignment, not a role. ACCOUNTANT only when `fees` flag on.
- User lifecycle: **INVITED → ACTIVE → DISABLED**. Provisioned INVITED (Admin API), activated on first sign-in, disabled = soft (history preserved, never deleted).

## Sign-in
- Parents: **phone OTP**; Staff: **email + password** — both via Supabase Auth. No public signup.
- All Supabase calls live in `@repo/auth` (`signInWithPassword`/`signInWithOtp`/`verifyOtp`/`resetPassword`/`updatePassword`/`getSession`/`onAuthStateChange`/`signOut`/`refreshSession`).

## Identity vs authorization
- `AuthUser` = Supabase identity only (userId/email/phone) — **no role**.
- `Principal` = `{ userId, schoolId, role, status }`, built from the DB `User` profile via `resolvePrincipal`. Flow: `JWT → userId → load profile → Principal → authorize`.

## Gates & guards
- Transport: `protectedProcedure` (authenticated + `ACTIVE`) and `onboardingProcedure` (INVITED-or-ACTIVE, for activation). No transport role gate.
- Business: `assertCan(principal, PERMISSION)` (permission) then `assertScope(principal, resource, rule)` (scope). M1 scope = `ownsAccount` (self); admin overrides via permissions.
- Permission catalog + `ROLE_PERMISSIONS` in `@repo/constants`; evaluators `can`/`canAny`/`canAll` in `@repo/core`.

## Sessions
- Web: SSR cookies + `middleware.ts` refresh; server reads session from cookies. Mobile: SecureStore + `autoRefreshToken`; bearer token to the tRPC route.
- tRPC context resolves identity (cookie or bearer) → `Principal`. Errors map `DomainError → TRPCError` (UNAUTHORIZED/FORBIDDEN/NOT_FOUND) via `mapDomainErrors`, which inspects the middleware **result** (tRPC v11 `next()` returns `{ ok, error }`, it never throws — see API_CONVENTIONS §6).
- Mid-session revocation: `protectedProcedure` re-checks `status === ACTIVE` from the DB on every request, so a DISABLED user is cut off despite a valid JWT.

## Procedures (M1)
`auth.me`, `auth.registerProfile` (activate), `auth.updateProfile` (self locale), `auth.setRole` / `auth.disableUser` / `auth.enableUser` (SUPER_ADMIN, audited in-transaction). Logout/refresh are client session ops.

## Audit
`setRole`, `disableUser`, `enableUser`, and `USER_ACTIVATED` all write an `AuditLog` row in the same transaction (ADR-007).

## Security & tests
- Security review (M1 Step 9): `docs/SECURITY_REVIEW_M1.md` — `signInWithOtp` must always pass `shouldCreateUser: false` (no public signup; regression-tested); web security headers in `next.config.ts`; Supabase dashboard checklist pending provisioning.
- Tests (M1 Step 10): 7 suites, 80 tests — `@repo/auth` (identity seam, session helpers), `@repo/business` (services + activation), `@repo/api` (gates, Zod, error mapping), `@repo/core` (policy, errors), `@repo/validation` (inputs), web (middleware token rotation, protected-layout redirect).

## Pending
Provisioning (Admin API) + seed super-admin + SMS provider before real sign-in/OTP.
