# ADR-026 — Server-Side PDF Generation for Report Cards & Certificates

**Status:** Accepted — **implemented** · **Date:** 2026-07-13 · **Deciders:** Architecture, Product
**Related:** ADR-014 (report cards — the snapshot IS the record; PDFs render **from the frozen snapshot**, never a live re-query) ·
ADR-023 (documents/certificates — §3 promised "no file in v1; `storagePath` stays null until rendering lands"; this ADR lands it) ·
ADR-004 (private buckets + server-minted signed URLs — the PDF is stored as a **path**, served via the existing signed mint, never a public URL) ·
ADR-018 (the `*AndNotify` post-commit composition seam — report-card PDF render rides the same best-effort post-commit slot as the notification emit) ·
ADR-002 (business layer is the authorization gate; routers thin — the new mint runs the full read-scope chain before any URL exists) ·
ADR-024 (branding — the school display name for the PDF header comes from `BrandingSettings.displayName`).
**Precedes:** the first rendered artifacts for the two structured-data domains (report cards, certificates). Fee receipts are **deferred** (see Deviations).

---

> **Framing.** This is a **presentation/output** addition over the frozen ADR-014 (report cards) and ADR-023 (documents)
> engines. It adds **no business rule, no lifecycle state, no authorization change, no schema/migration.** The `pdfPath`
> (ReportCard), `storagePath`/`fileName`/`mimeType`/`sizeBytes` (Document), and `snapshotJson` columns already exist. The
> only new behaviour is a **render → upload → persist-path** step: post-freeze for certificates, post-commit best-effort
> for report cards.

## Context

ADR-023 §3 shipped certificate generation as **metadata-only** — it froze `snapshotJson` and explicitly left `storagePath`
null "until rendering lands". ADR-014 defined `ReportCard.pdfPath` and never wrote it. Both domains freeze a **structured
snapshot** at their issue moment (approve for report cards, generate for certificates) precisely so a later profile/roster
change cannot rewrite an issued record. What was missing was turning that frozen snapshot into a durable document a parent
can download.

The renderer (`@react-pdf/renderer@4.5.1`) was pre-chosen and de-risked with a Node smoke test (`renderToBuffer` produces a
real `%PDF-` buffer server-side). The remaining decisions were **where the render sits relative to the freeze/commit**, **how
the renderer is injected without dragging React into the business layer**, and **how the stored file is served** — all of
which have existing precedents in this codebase (StoragePort injection, ADR-004 signed mints, the ADR-018 post-commit
composer).

## Decision

1. **Render from the FROZEN snapshot, never a live re-query (ADR-014).** The certificate renders from the in-memory
   `DocumentSnapshot` that was just frozen; the report card renders from the card's frozen snapshot columns. The PDF is a
   faithful projection of the record as-issued.

2. **Store a PATH, not a URL (ADR-004 / B7).** The rendered bytes are uploaded to the existing private `documents` bucket at
   a `schoolId/…`-namespaced path. Only the path is persisted (`Document.storagePath`, `ReportCard.pdfPath`). Downloads go
   through short-lived server-minted signed URLs — **60s** for documents (the tighter ADR-023 §1 norm, already in place) and
   **300s** for the new report-card mint (the ADR-004 default). A public URL is never stored or returned.

3. **`PdfRenderer` port + apps/web adapter (the StoragePort split).** A framework-neutral `PdfRenderer` interface lives in
   `@repo/business` (`services/document/pdf-renderer.port.ts`) with **plain data** inputs (`CertificatePdfData`,
   `ReportCardPdfData` — school name, student name, class/section, a label/value table, issue date). The **only** react-pdf
   import in the whole tree is the web adapter (`apps/web/src/lib/pdf/renderer.tsx`, `createPdfRenderer()`), exactly mirroring
   how `StoragePort` is defined in business and implemented in `apps/web/src/lib/storage.ts`. The business layer stays free of
   React.

4. **Context injection mirrors storage exactly.** `ctx.pdf?: PdfRenderer | null` is added to the tRPC context alongside
   `ctx.storage`; the web route handler wires `pdf: createPdfRenderer()` beside `storage: createStoragePort()`. A new
   `renderProcedure` (built on `storageProcedure`) requires **both** ports and PRECONDITION_FAILEDs cleanly if either is
   absent. `StoragePort` gains one method: `uploadObject(bucket, path, bytes, contentType)` (Supabase `upload(..., { upsert:
   true })`).

5. **Certificate: render post-freeze, one insert.** `generateDocument` now takes `storage` + `pdf`. Because the snapshot is
   assembled **before** the transaction, the PDF is rendered and uploaded first (object-then-row, exactly like
   `createUploadedDocument`), and `storagePath`/`fileName`/`mimeType`/`sizeBytes` are written in the **same** `create` — no
   second write. `document.generate` is repointed to `renderProcedure`. The existing `document.downloadUrl` (60s) already
   serves `storagePath` — no new download procedure.

6. **Report card: render post-commit, BEST-EFFORT.** After `publishReportCard`'s transaction commits, the `*AndNotify`
   composer (`publishReportCardAndNotify`) calls `renderReportCardPdf`, which renders, uploads, and persists via a new
   unguarded `reportCards.setPdfPath(id, path)`. This is wrapped in try/catch and logged via `@repo/core` on failure — it
   **never** fails or rolls back the publish (`pdfPath` is not lifecycle-gating), sharing the exact best-effort posture of the
   ADR-018 notification emit that runs beside it. A new `reportCard.pdfDownloadUrl` mint (300s) runs the full read-scope chain
   (`loadReportCardInSchool` → `assertReportCardReadScope`) **before** minting and 404s when `pdfPath` is null.

## Deviations

- **Fee receipts are DEFERRED.** Payments have **no snapshot column and no `pdfPath`** — rendering a receipt would require a
  DB migration (a `Payment.snapshotJson` freeze + a path column) to preserve the render-from-frozen-snapshot invariant. That
  is out of scope here (this ADR is additive-only, no migration) and is the natural follow-up: add the Payment snapshot +
  path, then a `paymentReceiptPdf` render on the same seam.
- **`document.generate` and `reportCard.publish` move to `renderProcedure`.** In prod the web host always wires both ports, so
  this always passes; it is a feature-availability gate, not a control-flow change to the frozen services. The consequence:
  transport tests that asserted the generate/publish **permission** matrix without wiring storage now assert
  PRECONDITION_FAILED (the gate precedes the resolver) — the permission cases are covered in the `@repo/business` service
  tests, matching the existing precedent for `uploadUrl`/`downloadUrl`.
- **School name via `BrandingSettings.displayName`.** The `School` row is a standalone repo outside `ctx.repositories`;
  `BrandingSettings` (in-context, ADR-024) carries the display name and is the correct header source, with a `"School"`
  fallback.

## Alternatives considered

- **`@react-pdf/renderer` (chosen) vs headless Chromium (Puppeteer/Playwright).** Headless-chromium renders HTML/CSS and can
  look richer, but: (a) it wants a **browser binary** in the deploy image — a heavyweight, fragile Docker dependency and a
  memory/cold-start cost per render; (b) it is HTML-oriented, whereas our inputs are **structured snapshot data**, not
  documents — react-pdf consumes that data directly with no HTML-templating layer; (c) react-pdf is **pure JS**, runs in the
  same Node process, and was already de-risked with a passing `renderToBuffer` smoke test. We chose react-pdf: pure-JS,
  structured-data-first, no extra runtime.
- **Store a public URL vs a path.** Rejected — violates ADR-004 (private buckets, signed-mint-only); a leaked public URL is an
  un-revocable data exposure.
- **Render inside the publish transaction (report cards).** Rejected — rendering/uploading is a slow network side-effect; a
  hiccup must never roll back a durable, lifecycle-complete publish. Post-commit best-effort is the ADR-018 posture.

## Consequences

- Certificates now produce a downloadable PDF at generate time; `DocumentDto.hasFile` becomes true and the existing 60s mint
  serves it. Report cards gain a downloadable PDF shortly after publish (or not at all, silently, if a render fails — the
  publish is unaffected and a re-publish re-renders).
- One new dependency surface (react-pdf) is confined to `apps/web`; `@repo/business`/`@repo/api` remain framework-free and
  re-export only the `PdfRenderer` type.
- `StoragePort` grows one method (`uploadObject`); all existing fakes updated.
- A report card whose render failed has `pdfPath === null` → its `pdfDownloadUrl` returns 404 until the next publish
  re-renders. This is acceptable (best-effort, not lifecycle-gating) and observable via the logged error.

## Implementation notes

- **Files (business):** `services/document/pdf-renderer.port.ts` (new port + data types), `services/people/document-storage.service.ts`
  (`StoragePort.uploadObject`), `services/document/document.service.ts` (`generateDocument` render), `services/report-card/pdf.ts`
  (new — `renderReportCardPdf` + `reportCardPdfDownloadUrl`), `services/notification/publish-with-notify.ts` (composer threads
  storage+pdf), barrels updated.
- **Files (db):** `repositories/report-card.repository.ts` — `setPdfPath(id, path)` (unguarded update).
- **Files (api):** `context.ts` (`pdf` on context + createContext), `trpc.ts` (`renderProcedure`), `routers/document.ts`
  (generate → renderProcedure), `routers/report-card.ts` (publish → renderProcedure, new `pdfDownloadUrl` on storageProcedure),
  `index.ts` re-exports the `PdfRenderer` types.
- **Files (web):** `src/lib/pdf/renderer.tsx` (`createPdfRenderer` + two institutional templates), `src/lib/storage.ts`
  (`uploadObject`), `app/api/trpc/[trpc]/route.ts` (wire `pdf`).
- **Tests:** web renders each template from a representative sample and asserts `%PDF-` + non-empty; business asserts
  generate renders+uploads+persists; api asserts the new PRECONDITION_FAILED gates. Fakes return `new Uint8Array([37,80,68,70])`
  / no-op upload.
- **Path patterns:** certificate `schoolId/studentId/uuid-Title.pdf`; report card `schoolId/studentId/uuid-report-card-{id}.pdf`.
  Both in the private `documents` bucket, `application/pdf`.
