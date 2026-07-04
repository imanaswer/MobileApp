import { checkReadiness } from "@repo/business";

import {
  academicTermRouter,
  academicYearRouter,
  classRouter,
  sectionRouter,
  subjectRouter,
  teacherAssignmentRouter,
} from "./routers/academic";
import { authRouter } from "./routers/auth";
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
});

export type AppRouter = typeof appRouter;
