# Current Milestone

**M1.5 — Infrastructure Provisioning — ✅ COMPLETE** · M1 approved & frozen.

## Current Step

Milestone delivered and verified (11/11 live auth checks). **Stop — M2 begins only on explicit approval.**

## What exists now

- Live Supabase project `wupcsvbyrknfuuskzuzp` — migrated, security-configured (config-as-code, see `docs/RUNBOOK_SUPABASE_SETUP.md`).
- Ops scripts: `pnpm --filter @repo/business run bootstrap | provision | verify:auth`.
- Evidence + deferred items: `docs/milestones/M1.5-infrastructure.md`.

## Out of scope until approved

All M2 feature work (students, staff, guardians, academic structure, CRUD).

## Standing blockers (go-live, not code)

Real SMS provider + DLT for parent OTP (test number only today) · credential rotation before real data · HIBP needs Pro plan · custom SMTP for production email.
