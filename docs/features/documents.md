# Documents, Certificates & Downloads (M15, ADR-023)

A secure per-student document center over frozen M1–M14 — the school **issues** certificates (generated or uploaded),
runs an **approval workflow**, and parents **download** their child's approved documents via short-lived signed URLs. Two
new tables, one new private bucket, three new permissions. **Distinct from M3 `StudentDocument`** (KYC/identity uploads
with type-visibility); M15 `Document` is an issued record with an approval lifecycle.

## Model

- **Two grains.** A `Document` is **GENERATED** (from data — values frozen into `snapshotJson`) or **UPLOADED** (the
  office pushes a prepared file), then **APPROVED** (the visibility gate), then **ARCHIVED** (soft-retire). A
  `DocumentTemplate` labels/enables which types the office may generate (minimal in v1 — the renderer body is reserved).
- **Snapshot = historical accuracy (ADR-014 philosophy).** `generate` freezes the student's identity (name, admission
  no) + current placement (class/section/year, from the current `Enrollment`) into `snapshotJson`, written once and never
  mutated — a later profile change can't rewrite an issued certificate. A future renderer reads the snapshot, not live data.
- **Metadata-first generation (v1).** No PDF/HTML renderer exists (the ReportCard `pdfPath`-deferred precedent), so a
  GENERATED doc carries the snapshot but **no rendered file** (`storagePath` null, `hasFile` false); storage never
  lifecycle-gates. The **upload** path is fully working end-to-end. Rendering (HTML/PDF) is the named deferred upgrade
  behind the same service method.
- **Authorization (ADR-002).** `document:manage` (generate/upload/delete-draft/archive + template CRUD) and
  `document:approve` are SA/OA only; `document:read` is admin (all) / teacher (own-section) / parent (own-child).
  **Non-admins see APPROVED documents only** — the report-card PUBLISHED-only precedent; drafts/archived are staff-only.
  Every mutation writes AuditLog in-transaction. RLS is coarse defense-in-depth (reuses the M3 people_rls helpers).
- **Storage (ADR-004).** Private `documents` bucket; paths only, never URLs; a **60-second** server-minted signed URL is
  issued per read after the authz + APPROVED-only check — before any URL exists.

## Surface

| Procedure (`document.*`) | Role | Does |
|---|---|---|
| `generate({studentId,type,templateId?,fields?})` | admin | create GENERATED (snapshot frozen) |
| `uploadUrl({studentId,fileName})` | admin | mint 60s signed upload URL (storage) |
| `createUploaded({studentId,type,storagePath,fileName,…})` | admin | record UPLOADED after the file is pushed |
| `approve({id})` / `archive({id})` / `deleteDraft({id})` | admin | lifecycle (approve; retire; delete draft only) |
| `list({studentId?,type?,status?})` | admin | school-wide console (filters) |
| `listStudentDocuments({studentId,type?,status?})` | admin/teacher/parent | a student's docs (APPROVED-only for non-admins) |
| `downloadUrl({id})` | admin/teacher/parent | 60s signed read URL (storage; APPROVED-only for non-admins) |

`documentTemplate.*`: `list` / `create` / `update` (admin — rename / (de)activate).

## UI

- **Web** (`/(app)/documents`): admin console — filters (student/type/status), **Generate** + **Upload** modals,
  **Approve/Archive/Delete** workflow, **Preview** (opens the 60s URL), **CSV export**; plus `/documents/templates`
  (create/rename/activate). Teachers/parents get a read-only view (pick student → APPROVED docs → Download).
- **Mobile** (`(app)/documents/*`): a student picker → the document center **grouped by type**; **Open** (download/preview
  via `Linking.openURL`); admins generate/approve/archive/delete. **Uploads are a web action** (no mobile file picker).

## Not built (v1)

Certificate **rendering** (HTML/PDF — metadata + snapshot only; upload path works) · cross-domain render of report-card /
fee-receipt (UPLOADED slots) · digital signatures / e-sign / DigiLocker · OCR · AI extraction · version history · bulk
generation · email / WhatsApp / push · draft bucket-object cleanup (`StoragePort` has no delete). See ADR-023 §deviations.
