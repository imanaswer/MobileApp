/**
 * @repo/api — the single tRPC API shared by web + mobile. Routers are
 * transport-only: validate → authorize → call @repo/business (ADR-002).
 */
export { appRouter, type AppRouter } from "./root";
export {
  router,
  publicProcedure,
  protectedProcedure,
  onboardingProcedure,
  createCallerFactory,
} from "./trpc";
export { createContext, type Context, type CreateContextOptions } from "./context";
// Server-side readiness check for the web `/api/ready` route (keeps apps off @repo/db).
export { checkReadiness, type ReadinessReport } from "@repo/business";
// Host-implemented signed-URL port (ADR-004) — keeps apps off @repo/business.
export type { StoragePort } from "@repo/business";
// Host-implemented PDF renderer port (ADR-026) — apps/web supplies the react-pdf adapter.
export type { PdfRenderer, CertificatePdfData, ReportCardPdfData, PdfRow } from "@repo/business";
