# Status — Documents, Certificates & Downloads (M15)

**State:** ✅ Steps 1–9 complete — awaiting milestone approval. **ADR-023** (Accepted). Purely additive; two new tables.

## Shipped

- **DB**: `Document` + `DocumentTemplate` (migration `20260712050000_documents_management`); enums `DocumentType` /
  `DocumentStatus`. `Document.snapshotJson` freezes generation values; `storagePath` nullable (metadata-only v1). FKs
  Restrict; indexes `[studentId,type]`/`[schoolId,status]`/`[schoolId,createdAt]`. **Zero frozen-table ALTER**
  (`migrate diff` no-op after apply). New private bucket `documents` (runbook §3d).
- **RLS**: `20260712060000_documents_rls` — admin ALL / teacher own-section / parent own-child / anon none (reuses M3
  helpers); `DocumentTemplate` admin-only.
- **Business**: `services/document/*` — generate (system-sourced snapshot), upload (mint→persist), approve, archive,
  delete-draft, download-url, per-student + school-wide lists, template CRUD; every mutation audited.
- **API**: `document.*` (9) + `documentTemplate.*` (3); upload/download via `storageProcedure`.
- **Mobile**: `(app)/documents/*` — student picker + grouped-by-type center; download/open; admin generate/approve/
  archive/delete. Upload is web-only.
- **Web**: `(app)/documents` admin console (filters, generate/upload modals, approval workflow, CSV export, preview) +
  `/documents/templates`; teacher/parent read-only view.

## Verification

- Gate green: lint 14/14, typecheck 14/14 (incl. mobile), test (business 445, api 383, core/web/validation), db:validate,
  web build 40/40.
- Tests: business 10 (lifecycle, snapshot freeze, APPROVED-only visibility, scope, no-file download), api 17 (transport
  permission matrix + storage precondition + Zod).
- **RLS proven empirically** — 11/11 (admin all, teacher own-section, teacher write-denied, parent own-child, parent ≠
  other parent, anon denied, template admin-only) against local Postgres.
- **Not runtime-verified visually** — the web/mobile screens need the app running with real Supabase secrets + a
  provisioned `documents` bucket (unavailable in the build environment). Types, lint, and production build are green.

## Known limitations (v1)

Generated certificates carry **no rendered file** (snapshot only; `hasFile` false) — HTML/PDF rendering is the deferred
upgrade; the upload path is fully working. `REPORT_CARD`/`FEE_RECEIPT` are UPLOADED slots (no cross-domain render). A
deleted draft's bucket object is left orphaned (`StoragePort` has no delete). No version history, e-sign, OCR, or bulk
generation (ADR-023 §out-of-scope). The `documents` bucket must be provisioned once (runbook §3d) before live upload/download.
