# Status — Report Cards & Academic Results

- **Status:** Implemented (M7 Steps 1–10 complete) — awaiting milestone approval
- **Current milestone:** M7 (Report Cards & Academic Results) — the academic reporting layer over M3–M6
- **Completion:** 100% of M7 scope
- **Spec / decision:** `docs/architecture/ADR-014-report-card-snapshot-ownership.md` (extends ADR-009; consumes ADR-015) · `docs/milestones/M7.md` · `docs/features/report-cards.md`

- **Schema:** `ReportCard` (migration `20260710030000_report_card_management`) — **Enrollment-owned**; `kind` EXAM/TERM/ANNUAL + nullable `examId`/`termId`; `version`; lifecycle `status` enum (DRAFT/SUBMITTED/APPROVED/PUBLISHED/SUPERSEDED/REVOKED); snapshot columns (attendance %/counts, rank/rankScope/cohortSize, gpaSnapshot); authored fields (class-teacher/principal remark, promotion decision); `pdfPath`; 6 Staff audit actors, all `onDelete: Restrict`. 4 enums. CHECKs: kind⟺scope, snapshot-iff-approved, published/revoked stamps, numeric domains. Partial-uniques: one-PUBLISHED-per-scope + (scope, version) per kind. Purely additive (161 insertions, 0 frozen-table ALTERs); **zero drift**. **13/13 constraint proofs** + **9/9 FK delete-rule matrix** + **6/6 rollback probes** on local Postgres.

- **RLS:** dedicated migration `20260710040000_report_card_rls` (defense-in-depth; app path is `service_role`/BYPASSRLS). New helper `is_class_teacher_of_enrollment`; reuses `is_academic_admin` + `is_my_child_enrollment`. 4 policies: admin ALL; class-teacher SELECT own-section + UPDATE DRAFT/SUBMITTED; parent SELECT own-child PUBLISHED. **10/10 read+write isolation proven**.

- **Business:** `services/report-card/` — lifecycle (`generate`, `draftClassTeacherRemark`, `edit`, `submit`, `approve`, `reopen`, `publish`, `revoke`, `correct`) + reads (`getReportCard`, `listReportCardsForEnrollment`, `listReportCardsForSection`); `snapshot.ts` (pure `computeRank` + `assembleSnapshot` over the canonical attendance/GPA services); `scope.ts` (loaders, mappers, read-scope, the centralized `assertScopeYearMatches` year-consistency gate, reuses `assertClassTeacherOfEnrollment`). Persistence-only `report-card.repository.ts` (guarded transitions). One tx per transition; audit per mutation.

- **API:** thin `reportCard` tRPC router — 12 procedures (get/listForEnrollment/listForSection + generate/draftRemark/edit/submit/approve/reopen/publish/revoke/correct), all `protectedProcedure`, validate-then-delegate; Zod inputs in `@repo/validation`. Mounted as `reportCard` in `root.ts`.

- **Mobile:** parent report-card viewing — `report-cards/children` (child picker) → `report-cards/[studentId]` (PUBLISHED cards + inline snapshot). Home nav gated `REPORT_CARD_READ && role===PARENT`. (Class-teacher authoring + admin lifecycle are web.)

- **Web:** role-aware console `/report-cards` (parent child-view; admin/class-teacher section console with year/section/kind/status filters + Generate) + `/report-cards/[id]` (snapshot, version history [version+status], status/role-gated lifecycle actions). Reuses the academic UI kit.

- **Testing:** 54 automated (business 32 = 25 lifecycle + 3 section-scope gate + 4 rank; api transport 22) + DB SQL proofs (13 constraints, 9/9 FK matrix, 6 rollback probes, 10 RLS isolation). Full gate: typecheck 14/14, lint 14/14, test 7/7. `next build` compiles both routes.

- **Frozen?** No (freezes on M7 approval). M1–M6.5 stayed frozen — M7 is purely additive (`+ReportCard` table/enums, 3 permissions, 1 additive `listForSection` read; no existing schema/service/contract/RLS change).

- **Known limitations:** no PDF generation (`pdfPath` + bucket provisioned; bilingual en+ml deferred); no report-card notifications; no CGPA-across-years (`cgpaSnapshot` reserved, null); mobile is parent-read only; web card list is current-year (cross-year trail deferred); class teacher who teaches no subject in their section relies on `reportCard.listForSection` (roster picker is admin-only).
- **Names (M8, ADR-016):** report-card surfaces now show real names — `ReportCardDto` carries `examName`/`termName`
  (scope label) + `classTeacherName` (the remark author, via `submittedByStaffId`); `listForSection` rows carry
  `studentName`+`rollNo`; the web GenerateModal + section console show `studentName`, not raw cuids.

- **Next work:** milestone approval → freeze. Provision the private report-card bucket before live PDF rendering (a runbook step, like `homework-files`).
