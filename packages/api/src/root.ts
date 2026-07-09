import { checkReadiness } from "@repo/business";

import {
  academicTermRouter,
  academicYearRouter,
  classRouter,
  sectionRouter,
  subjectRouter,
  teacherAssignmentRouter,
} from "./routers/academic";
import {
  attendanceCorrectionRouter,
  attendanceRouter,
  holidayRouter,
  leaveRouter,
} from "./routers/attendance";
import { authRouter } from "./routers/auth";
import { assessmentRouter, examRouter, gradeScaleRouter, markRouter } from "./routers/exam";
import {
  enrollmentRouter,
  parentRouter,
  studentDocumentRouter,
  studentRouter,
  teacherProfileRouter,
} from "./routers/people";
import { publicProcedure, router } from "./trpc";

/**
 * The application router. M1 exposes system probes + authentication; feature
 * routers (students, attendance, …) mount here per milestone (Dev PRD §7).
 */
export const appRouter = router({
  system: router({
    /** Liveness — the process is up. No dependency checks. */
    live: publicProcedure.query(() => ({
      status: "ok" as const,
      time: new Date().toISOString(),
    })),
    /** Readiness — dependencies (DB) are reachable; safe to receive traffic. */
    ready: publicProcedure.query(() => checkReadiness()),
  }),
  auth: authRouter,
  academicYear: academicYearRouter,
  academicTerm: academicTermRouter,
  class: classRouter,
  section: sectionRouter,
  subject: subjectRouter,
  teacherAssignment: teacherAssignmentRouter,
  student: studentRouter,
  parent: parentRouter,
  teacherProfile: teacherProfileRouter,
  enrollment: enrollmentRouter,
  studentDocument: studentDocumentRouter,
  attendance: attendanceRouter,
  leave: leaveRouter,
  attendanceCorrection: attendanceCorrectionRouter,
  holiday: holidayRouter,
  exam: examRouter,
  assessment: assessmentRouter,
  mark: markRouter,
  gradeScale: gradeScaleRouter,
});

export type AppRouter = typeof appRouter;
