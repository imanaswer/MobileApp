import { DomainError, errorFields, logger } from "@repo/core";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import type { Context } from "./context";
import { checkRateLimit, rateLimitFor } from "./rate-limit";

/**
 * tRPC initialization. `superjson` preserves Dates/etc.; the error formatter
 * surfaces Zod field errors so forms can map them (API_CONVENTIONS.md §6).
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zod: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Domain error `code` → tRPC error code (API_CONVENTIONS.md §6). */
const DOMAIN_TO_TRPC: Record<
  string,
  "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST"
> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  BAD_REQUEST: "BAD_REQUEST",
};

/**
 * Translate business `DomainError`s (thrown by services) into typed `TRPCError`s
 * so clients get FORBIDDEN/NOT_FOUND/… instead of a generic 500. Applied to every
 * procedure. Existing `TRPCError`s (e.g. the auth gates) pass through unchanged.
 *
 * tRPC middleware `next()` does NOT throw on downstream errors — it returns
 * `{ ok: false, error }` with the original exception wrapped as `error.cause`
 * (a plain try/catch here would never fire), so the mapping inspects the result.
 */
const mapDomainErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof DomainError) {
    const domainError = result.error.cause;
    throw new TRPCError({
      code: DOMAIN_TO_TRPC[domainError.code] ?? "INTERNAL_SERVER_ERROR",
      message: domainError.message,
      cause: domainError,
    });
  }
  return result;
});

/**
 * App-level rate limiting for sensitive mutations (ADR-025 §2). Only the paths in
 * `rateLimitFor` are limited (publish/approve/upload mints); everything else passes
 * through. Keyed by `path:userId` — the actor identity already on `ctx` (login
 * itself is Supabase-direct and rate-limited there, not here). Runs before the
 * domain-error mapping so an over-limit caller is rejected early.
 */
const rateLimit = t.middleware(({ ctx, path, next }) => {
  const cfg = rateLimitFor(path);
  if (cfg) {
    const key = `${path}:${ctx.user?.userId ?? "anon"}`;
    if (!checkRateLimit(key, cfg.limit, cfg.windowMs)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please wait a moment and try again.",
      });
    }
  }
  return next();
});

/**
 * Structured request logging (ADR-025 §3). Outermost so it measures the full
 * procedure duration and sees the final outcome. One JSON line per call:
 * INFO on success, ERROR on failure (with the underlying error/stack). Pure
 * observation — the result is returned unchanged.
 */
const requestLogging = t.middleware(async ({ ctx, path, type, next }) => {
  const start = Date.now();
  const result = await next();
  // Keep test output clean — the transport per-request log would emit one JSON
  // line (with stacks for expected-error cases) per procedure call. The logger
  // module itself is unit-tested directly in @repo/core.
  if (process.env.VITEST) return result;
  const fields = {
    requestId: ctx.requestId,
    userId: ctx.user?.userId,
    schoolId: ctx.user?.schoolId,
    route: path,
    durationMs: Date.now() - start,
  };
  if (result.ok) {
    logger.info(`${type} ${path}`, { ...fields, status: "ok" });
  } else {
    logger.error(`${type} ${path} failed`, {
      ...fields,
      status: result.error.code,
      ...errorFields(result.error.cause ?? result.error),
    });
  }
  return result;
});

const baseProcedure = t.procedure.use(requestLogging).use(rateLimit).use(mapDomainErrors);

/** Open to anyone (e.g. health). */
export const publicProcedure = baseProcedure;

/**
 * Protected: authenticated **and** an `ACTIVE` profile. `INVITED` and `DISABLED`
 * are rejected — the latter enforces mid-session revocation despite a valid JWT.
 * All AUTHORIZATION (role → permission → scope) is decided in the business layer
 * against the DB-built `Principal`, never the request identity (ADR-002, §4.4).
 */
export const protectedProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (ctx.user.status !== "ACTIVE") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ctx.user.status === "DISABLED" ? "Account is disabled" : "Account is not activated",
    });
  }
  return next({ ctx: { user: ctx.user } });
});

/**
 * Protected + requires the host-wired `StoragePort` (signed-URL minting,
 * ADR-004). Hosts without storage (tests, misconfigured envs) get a clean
 * PRECONDITION_FAILED instead of a null-access 500. Authorization for WHAT may
 * be minted stays in the business layer.
 */
export const storageProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.storage) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "File storage is not configured",
    });
  }
  return next({ ctx: { storage: ctx.storage } });
});

/**
 * Storage + the host-wired `PdfRenderer` (ADR-026) — for routes that render a PDF
 * and write it to a bucket (document generate, report-card publish). Builds on
 * {@link storageProcedure}; a host missing either port gets a clean
 * PRECONDITION_FAILED. The web host always wires both, so this passes in prod.
 */
export const renderProcedure = storageProcedure.use(({ ctx, next }) => {
  if (!ctx.pdf) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "PDF rendering is not configured",
    });
  }
  return next({ ctx: { pdf: ctx.pdf } });
});

/**
 * Onboarding path only: authenticated with an `INVITED` **or** `ACTIVE` profile
 * (`DISABLED` rejected). The seam `auth.registerProfile`/`auth.me` run on, so a
 * first-time INVITED user isn't locked out by the ACTIVE-only gate.
 */
export const onboardingProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (ctx.user.status === "DISABLED") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Account is disabled" });
  }
  return next({ ctx: { user: ctx.user } });
});
