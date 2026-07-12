# ADR-023 — Documents, Certificates & Downloads — M15

**Status:** Accepted — **M15 implemented (Steps 1–9)** · **Date:** 2026-07-12 · design approved 2026-07-12 (two new tables + `documents` bucket + 60s URLs; `Document` separate from M3 `StudentDocument`; **generation metadata-only in v1 with an immutable `snapshotJson`**; `DocumentTemplate` minimal; lifecycle GENERATED/UPLOADED→APPROVED→ARCHIVED, delete-drafts-only; three permissions with **APPROVED-only visibility** for teachers/parents; teacher scope narrowed to **own-section** per the M3 precedent) · **Deciders:** Architecture, Product
**Related:** ADR-002 (business layer is the authorization gate; routers thin) ·
ADR-003 (repositories own all Prisma/SQL — M15 adds new read/write repos, no cross-domain writes) ·
ADR-004 (**private buckets + server-minted signed URLs** — the governing storage decision; M15 is a textbook instance) ·
ADR-007 (AuditLog — **every M15 mutation writes one**, in the mutation's transaction) ·
ADR-008 (loose `schoolId` — both new tables carry it) ·
ADR-010 (Enrollment/Student are the person keys — a `Document` hangs off `Student`) ·
ADR-014 (ReportCard `pdfPath` — provisioned, rendering **deferred**; M15 inherits the same metadata-first posture and does **not** re-render report cards) ·
M3 `StudentDocument` (the KYC/identity upload sibling — M15 is deliberately a **separate** table, §2) ·
PERMISSIONS_MATRIX (M15 adds **three** permissions — `document:manage`/`document:approve`/`document:read`).
**Precedes:** M15 (Documents, Certificates & Downloads) — this ADR fixes the design; Steps 2–9 execute it.

---

> **Milestone framing.** M15 adds a **secure per-student document center** — issued certificates (Bonafide, Study,
> Character, Transfer, Hall Ticket, ID Card) plus fee-receipt and report-card slots — over frozen M1–M14. It is **purely
> additive**: **two new tables only** (`Document`, `DocumentTemplate`), **one new private bucket** (`documents`), three
> new permissions. **Zero ALTER on any M1–M14 table** (including M3's frozen `StudentDocument`), **no business-logic
> change** to any existing domain. Storage holds **paths only**; access is a **60-second server-minted signed URL** after
> an authz check (ADR-004). Proven at Step 2 by `prisma migrate diff` (only the two new tables). OUT OF SCOPE (brief):
> digital signatures / eSign / DigiLocker, OCR, AI extraction, version history, bulk generation, email / WhatsApp / push.

## Context

Everything M15 needs to store and serve a file already exists; the only genuinely new question is what "generate" produces.

- **The storage seam is built and proven.** `StoragePort` (`business/services/people/document-storage.service.ts:17`)
  is a framework-free port — `createSignedUploadUrl(bucket, path)` and `createSignedDownloadUrl(bucket, path, expiresInSeconds)` —
  with a Supabase adapter in `apps/web/src/lib/storage.ts` injected via `storageProcedure`. Homework, submissions,
  announcements and M3 student-docs all mint through it. **M15 reuses this seam verbatim** — no new storage code, only a
  new bucket name and a new service that calls the port.
- **Buckets are a constant + a runbook step.** `STORAGE_BUCKETS` (`constants/src/index.ts:51`) lists
  `student-documents` / `homework-files` / `announcement-attachments`; buckets are provisioned manually
  (`RUNBOOK_SUPABASE_SETUP.md`), not in code. M15 adds `DOCUMENTS: "documents"` — **distinct from M3's `student-documents`**.
- **No PDF/HTML renderer exists anywhere.** No `pdfkit`/`puppeteer`/`@react-pdf`/`jspdf`/`handlebars`/`ejs` in any
  `package.json`. ADR-014's `ReportCard.pdfPath` is **provisioned but always null** — approve never sets it, reopen clears
  it, no generation/serving code exists (`report-card.service.ts:48`). M7 deferred report-card PDF; M14 shipped "no PDF".
  **M15 is the first milestone to confront certificate rendering** — §3 decides it.
- **M3 `StudentDocument` already exists** (`schema.prisma:371`) — immutable KYC/identity **uploads** (BIRTH_CERTIFICATE,
  PASSPORT, AADHAAR, MEDICAL_RECORD, TRANSFER_CERTIFICATE, PHOTO, OTHER), no lifecycle, no approval, visibility filtered
  **by type** (teacher sees PHOTO only). Superficially overlaps M15; §2 explains why it is **not** extended.
- **The domain-module shape is fixed** — `services/<domain>/` (service + `scope.ts` re-exporting `recordAudit`/
  `isFullAccess` + `mappers.ts` + `index.ts` barrel + test), repos one-per-aggregate in `db/src/repositories/`, a thin
  router in `api/src/routers/` mounted flat in `root.ts`, Zod inputs in the **single shared** `packages/validation/src/index.ts`.
  Restrict FKs, `cuid()` ids, loose `schoolId`, no `@@map` (model name == table name), `recordAudit` inside
  `ctx.withTransaction`, `assertCan`/`assertScope` at the top of each service fn. M15 follows this skeleton exactly.

## Decision

### 1. Two new tables, one new bucket, zero frozen change

- **`Document` + `DocumentTemplate` only.** No column, enum, or constraint added to any M1–M14 table (M3's
  `StudentDocument` is untouched). Two new enums: `DocumentType`, `DocumentStatus`. Proven by `migrate diff` at Step 2.
- **New private bucket `documents`** (added to `STORAGE_BUCKETS`; provisioned via the runbook, like every other bucket) —
  separate from `student-documents`. Store `storagePath` only; **never persist a URL** (DB conventions §4).
- **60-second signed-URL expiry** — the brief's requirement, a deliberate tightening from the existing
  `DOWNLOAD_URL_TTL_SECONDS = 300` norm. A certificate link is short-lived by design; the service passes `60` explicitly.

### 2. `Document` is NOT `StudentDocument` — separate table, separate concern (spec-decided; stated for the record)

The brief says "New tables only"; this section records *why* extending M3 would be wrong, so a reviewer needn't ask.

| | **M3 `StudentDocument`** | **M15 `Document`** |
|---|---|---|
| Purpose | KYC / identity files **received** and stored | Certificates the school **issues** + downloads |
| Origin | upload only | generated **or** uploaded |
| Lifecycle | none (immutable, version-ready) | GENERATED/UPLOADED → APPROVED → ARCHIVED (§5) |
| Approval | none | `document:approve` gate (§6) |
| Visibility | by **type** (teacher = PHOTO only) | by **status** (parent/teacher = APPROVED only, §6) |
| `TRANSFER_CERTIFICATE` | a **received** scan (from the prior school) | a TC **issued** by this school |

Same word, opposite direction. Merging would force an approval lifecycle onto immutable KYC uploads and a type-visibility
filter onto issued certificates — two incompatible authorization models in one table. Kept separate; M3 stays frozen.

### 3. Generation is **metadata-first** in v1 — rendering is the named, deferred upgrade (**the load-bearing decision**)

The brief's Step 4 says "**Generate metadata**" / "**Upload metadata**" — not "render a PDF." No renderer exists, and both
M7 and M14 deliberately deferred PDF. This ADR chooses the honest, precedent-backed reading and flags the scope call:

- **`document.generate` writes a `Document` row (status `GENERATED`) with the certificate's field values frozen into an
  immutable `snapshotJson` payload** (student name, admission no, class/section, issue date, and the per-type fields a
  Bonafide/Study/Character/TC/Hall-Ticket/ID-card needs) and **`storagePath` NULLABLE — no bytes rendered in v1.**
  - **The snapshot is the load-bearing durability guarantee** — it captures the values *as they were at generation time*,
    so a later profile change (e.g. a name correction) **never** rewrites an already-issued certificate. This is the
    ADR-014 report-card snapshot philosophy: a `Document` is a point-in-time record, not a live view of `Student`.
    `snapshotJson` is **written once at generate and never mutated** (approve/archive don't touch it).
  - **A JSON column, not per-field columns** — the payload differs by `DocumentType` (a Hall Ticket carries exam/room
    data a Character certificate does not), so a single `Json` column fits (the `AuditLog.beforeJson`/`afterJson`
    precedent) where the report-card's fixed academic snapshot used typed columns. The service validates the payload
    shape per type at generation; the DB stores it opaquely.
  - **`storagePath` NULLABLE mirrors `ReportCard.pdfPath` exactly**: the seam is provisioned, rendering is deferred, and
    storage **never** lifecycle-gates a transition (an unrendered GENERATED doc can still be APPROVED). When a renderer
    lands, **it reads from `snapshotJson`, not live `Student`** — so the rendered file matches what was issued. Download
    works for any doc that has a file (all UPLOADED docs; GENERATED docs once a renderer lands).
- **`document.upload` writes a `Document` row (status `UPLOADED`) with a real `storagePath`** — the office uploads a
  prepared certificate/receipt via the existing mint-upload-URL flow. **This is the fully-working path in v1**; the DoD
  ("upload workflow", "parent downloads", "signed URLs") is met by UPLOADED docs end-to-end today.
- **FLAGGED FOR YOUR APPROVAL — is M15 where rendering lands?** Three honest endpoints:
  1. **Metadata-only (recommended).** As above — generate records metadata, no dependency, matches the ReportCard
     posture. Rendering (and template *bodies*) deferred to a follow-up. Lowest risk, ships the whole workflow via UPLOAD.
  2. **HTML-render to bucket.** `generate` renders a string-templated HTML file into `documents`, signed on read;
     browsers print-to-PDF natively (no dependency). Real generated output, but commits `DocumentTemplate` to holding
     HTML bodies and puts cert-template authoring in scope.
  3. **True PDF renderer.** A net-new dependency (`@react-pdf`/`puppeteer`) — "the Documents milestone is where the
     twice-deferred PDF finally lands." Most capable, heaviest, against the standing deferred-PDF posture.

  Default unless you say otherwise: **(1) metadata-only**, rendering named as the deferred upgrade behind the same service
  method — a swap invisible to routers and UI.

### 4. `DocumentTemplate` is downstream of §3 — minimal, not a template engine

Its contents follow the rendering choice, so v1 does **not** speculatively build a template engine:

- **Under §3(1) metadata-only (default):** a template is essentially **`type` + display `name` + `isActive`** (+ a
  reserved nullable `body` column for the future renderer). It labels/enables which certificate types the office may
  generate; it does not render anything yet. `template.*` = list + CRUD of these rows.
- **Under §3(2)/(3):** the reserved `body` holds the HTML/layout the renderer consumes.

Either way `DocumentTemplate` is school-scoped, `Restrict`-referenced by `Document.templateId` (**nullable** — UPLOADED
docs need no template). No engine is written until §3 picks a rendering path.

### 5. Lifecycle — status enum, delete drafts only, archive-not-delete

`DocumentStatus`: **`GENERATED` | `UPLOADED`** (two draft origins) **→ `APPROVED`** (the published gate) **→ `ARCHIVED`**
(terminal, soft-retire). Following DB conventions §5/§7 (status-enum lifecycle, no `deletedAt`, `Restrict` FKs):

- **Hard delete is allowed only for a draft** — a `GENERATED`/`UPLOADED` doc not yet approved (`document:manage`, "delete
  draft" in the brief). Its bucket object is removed with the row.
- **`APPROVED`/`ARCHIVED` are never hard-deleted** — they carry issued-record value; retirement is `ARCHIVED` (soft),
  matching the archive-soft/delete-hard split M10 established.
- **`Document.studentId → Student` and `templateId → DocumentTemplate` are `onDelete: Restrict`** (data/record value;
  the M13 `Invoice` precedent).

### 6. Permissions — three new, APPROVED-only for non-staff (the main authz consequence)

The brief mandates three permissions (unlike M14's reuse). They follow the M12/M13 `manage`/`read` split shape:

| Permission | SA | OA | T | P | AC | Meaning |
|---|---|---|---|---|---|---|
| `document:manage` | any | school | – | – | – | generate + upload + delete-draft + archive + template CRUD |
| `document:approve` | any | school | – | – | – | approve a GENERATED/UPLOADED doc → APPROVED |
| `document:read` | any | school | **ownSection** (**APPROVED only**) | ownChild (**APPROVED only**) | – | list + download |

- **Visibility gate — parents and teachers see `APPROVED` documents only.** Drafts (`GENERATED`/`UPLOADED`) and
  `ARCHIVED` docs are **staff-only**; the read service filters by status for non-admin roles — the report-card
  PUBLISHED-only precedent applied to documents. This is the load-bearing authorization rule of the lifecycle.
- **Teacher is view-only, own-section** (`document:read`, no `manage`/`approve`) — the brief's "Teachers view only,"
  narrowed to the teacher's own-section students (the M3 `StudentDocument` precedent — teacher document access is
  own-section; matches the Step-3 `teaches_student` RLS). Parents download their own child's approved docs (`ownChild`
  scope). `document:manage`/`approve` are SA/OA only ("Office/Admin generate + upload + approve"). Accountant: none.
- Actor columns follow the M3 `StudentDocument.uploadedByUserId` loose-`*ByUserId` idiom (the document sibling
  precedent): `generatedByUserId` / `uploadedByUserId` / `approvedByUserId`.

### 7. Schema shape (conventions locked; exact columns finalized at Step 2)

- `Document`: `id cuid`, loose `schoolId`, `studentId → Student (Restrict)`, `type DocumentType`, `status DocumentStatus`,
  nullable `templateId → DocumentTemplate (Restrict)`, **nullable `snapshotJson Json`** (frozen generation payload, §3 —
  set on GENERATED, null for UPLOADED docs which carry a real file instead), nullable `storagePath` (§3),
  `fileName`/`mimeType?`/`sizeBytes?`, actor `*ByUserId` cols, `createdAt`/`updatedAt`, `approvedAt?`/`archivedAt?` stamps.
- **Indexes (brief):** `@@index([studentId, type])`, `@@index([schoolId, status])`, `@@index([schoolId, createdAt])` —
  every documented query path (a student's docs by type; the admin console by status; recent-first lists), no over-indexing.
- No `@@map` (model name == table name — house convention). RLS + any CHECKs added as raw SQL in the migration (§9).

### 8. Layering & API — thin routers, service owns everything

- **Repos** (`db/src/repositories/document.repository.ts`, `document-template.repository.ts`) own all Prisma — CRUD +
  scoped list; no business logic. **Services** (`services/document/`) own lifecycle, authz (`assertCan`/`assertScope`),
  status-visibility filtering, signed-URL minting via `StoragePort`, and `recordAudit` **inside `ctx.withTransaction`**
  for **every** mutation (generate/upload/approve/archive/delete). Mappers → DTO. `scope.ts` re-exports `recordAudit`/`isFullAccess`.
- **`document.*`** (generate, upload=mint-upload-URL + finalize, approve, archive, deleteDraft, downloadUrl,
  listStudentDocuments) and **`template.*`** (list, create, update, archive) — thin `protectedProcedure`/`storageProcedure`
  routers: validate (Zod from `@repo/validation`) → delegate. Mounted flat in `root.ts` (`document:`, `documentTemplate:`).

### 9. RLS + storage isolation (defense-in-depth; empirical proofs at Step 3)

Coarse RLS mirroring the M11/M12/M13 posture; business is the real gate (§6):

- `Document` / `DocumentTemplate`: **admin ALL**, **parent SELECT own-child** (via `GuardianStudent`), **teacher SELECT**
  (read-only), **anon none**. The status-visibility narrowing (APPROVED-only for parent/teacher) is enforced in the
  service; RLS is belt-and-braces. Proven at Step 3 (admin all / parent ≠ other parent / teacher read-only / anon denied).
- **Bucket `documents` is private** — no public access; every read is a 60-second signed URL minted **after** the §6
  authz check (ADR-004). Storage policy proofs at Step 3.

## Deviations from the literal brief (flagged for veto at STOP)

1. **Generation is metadata-only in v1 (§3)** — "Generate metadata" is read literally; no bytes are rendered because no
   renderer exists (the ReportCard `pdfPath` precedent). The upload path is fully working end-to-end. HTML/PDF rendering
   is the named, opt-in upgrade — **the one decision that needs your call.**
2. **"Report Card PDF" is not re-rendered here (§3)** — `ReportCard.pdfPath` already reserves that seam; M15 does not pull
   or render report cards. A `REPORT_CARD` document type exists as an UPLOADED slot; live report-card PDF stays ADR-014's concern.
3. **"Fee Receipt" is an UPLOADED slot in v1 (§3)** — M13 has no receipt PDF; the office uploads it. No cross-domain
   render from `Payment` in v1.
4. **60s expiry overrides the 300s norm (§1)** — the brief's tighter requirement, applied to M15 only.

## Alternatives considered

1. **Extend M3 `StudentDocument` instead of a new table.** Rejected (§2) — opposite lifecycle/visibility models; would
   also ALTER a frozen table (brief forbids it).
2. **Render real PDFs now (new dependency).** Deferred, not rejected (§3 option 3) — legitimate if you decide M15 owns
   rendering; default is metadata-only to hold the standing deferred-PDF posture.
3. **One `document:read` gate with no status filter.** Rejected (§6) — would leak unapproved drafts to parents/teachers;
   the APPROVED-only gate is the report-card precedent.
4. **Reuse `student_document:manage` (M3's permission).** Rejected — it governs KYC uploads with type-visibility; issued
   certificates need their own approve grant and status-visibility. Separate permissions match the separate table.
5. **Persist signed URLs / long expiry.** Rejected (ADR-004, DB conventions §4) — paths only, 60s per-read.

## Consequences

- (+) **Purely additive** — two tables, one bucket, three permissions; every frozen M1–M14 table/service untouched
  (proven by `migrate diff` at Step 2). M3 `StudentDocument` and ADR-014's `pdfPath` seam both preserved.
- (+) **Secure by default** — private bucket, 60s server-minted signed URLs after an authz check; APPROVED-only for
  non-staff makes draft leakage structurally impossible.
- (+) **Reuses the proven storage seam** — `StoragePort` + `storageProcedure`, no new storage code; the upload workflow
  ships complete in v1.
- (+) **Thin, testable** — §6 table is the permission-matrix test spec; lifecycle is a pure status machine.
- (+) **Issued certificates are historically accurate (§3)** — `snapshotJson` freezes the values at generation, so a
  later profile change never rewrites a previously-issued document; a future renderer reads the snapshot, not live data
  (the ADR-014 report-card snapshot guarantee).
- (−) **Generated certificates carry no rendered file in v1 (§3)** — metadata-only (but the snapshot payload is
  captured); rendering is the named deferred upgrade behind the same service method. The one decision requiring your approval.

## STOP — Step 1 boundary — ✅ APPROVED 2026-07-12

All six decisions approved as designed: **(a)** two new tables + `documents` bucket + 60s URLs, zero frozen change;
**(b)** `Document` separate from M3 `StudentDocument`; **(c)** **generation metadata-only in v1** with an immutable
`snapshotJson` (ADR-014 snapshot philosophy — user-requested refinement folded into §3); **(d)** `DocumentTemplate`
minimal until rendering is chosen; **(e)** lifecycle GENERATED/UPLOADED→APPROVED→ARCHIVED, delete-drafts-only; **(f)**
three permissions with **APPROVED-only visibility** — teacher scope narrowed to **own-section** (§6, the M3
`StudentDocument` precedent + Step-3 `teaches_student` RLS).

## Implementation notes (Steps 2–9, folded back)

- **Two additive tables** (`Document`, `DocumentTemplate`) + two enums, migration `20260712050000_documents_management`;
  **zero frozen-table ALTER** (`Student.issuedDocuments` is a virtual back-relation) — proven by `migrate diff` (empty,
  exit 0) after apply. `Document.snapshotJson` is `Json?`, set once on generate; `storagePath` nullable (metadata-only).
  FKs `Restrict`; indexes `[studentId,type]` / `[schoolId,status]` / `[schoolId,createdAt]`. No `@@map` (house convention).
- **RLS** migration `20260712060000_documents_rls` — reuses the M3 people_rls helpers verbatim (`is_academic_admin`,
  `teaches_student`, `is_my_child`); admin ALL / teacher own-section read / parent own-child read / anon none;
  `DocumentTemplate` admin-only. **11/11 empirical proofs** (admin all, teacher own-section, teacher write-denied, parent
  own-child, anon denied, template admin-only). New private bucket `documents` (runbook §3d), 60s signed URLs.
- **Business `services/document/`** — `generateDocument` (snapshot from Student + `currentEnrollment`, system-sourced),
  `documentUploadUrl`+`createUploadedDocument` (the working upload path), `approveDocument`, `archiveDocument`,
  `deleteDraftDocument`, `documentDownloadUrl` (60s; APPROVED-only for non-admins; typed no-file error),
  `listStudentDocuments` (APPROVED-only narrowing for non-admins), `listSchoolDocuments` (admin console), template CRUD.
  Every mutation writes AuditLog in-transaction. Actors are loose `*ByUserId` (the M3 idiom).
- **API** — thin `document.*` (9 procedures; upload/download via `storageProcedure`) + `documentTemplate.*` (3), mounted
  flat; Zod inputs in `@repo/validation` (`certTypeSchema` distinct from M3's `documentTypeSchema`).
- **Mobile** — `(app)/documents/*` (student picker + grouped-by-type center); download/preview = `Linking.openURL`;
  admin generate/approve/archive/delete; **upload is a web action** (no mobile file picker — the homework precedent).
- **Web** — `(app)/documents/page.tsx` (admin console: filters, generate + upload modals via `uploadToSignedUrl`,
  approval workflow, CSV export, preview; teacher/parent read-only) + `(app)/documents/templates/page.tsx`.
- **v1 simplifications accepted:** generation renders no file (metadata + snapshot only; the ReportCard `pdfPath`-deferred
  precedent — HTML/PDF rendering is the named upgrade behind the same service method); `REPORT_CARD`/`FEE_RECEIPT` are
  UPLOADED slots (no cross-domain render); draft delete leaves an orphaned bucket object (`StoragePort` has no delete —
  named ceiling). No PDF renderer, no version history, no e-sign (out of scope).
- **Gate green** — lint 14/14, typecheck 14/14 (incl. mobile), test (business 445 incl. 10 document tests, api 383 incl.
  17 document transport tests, core/web/validation), db:validate, web build 40/40. Zero new dependency.
