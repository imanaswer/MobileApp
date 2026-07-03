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
