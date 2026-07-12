/**
 * @repo/business — application use-cases & orchestration. The ONLY layer that
 * contains feature logic; it composes repositories (@repo/db) + pure rules
 * (@repo/core) + notifications, and never imports a UI framework (CODING_STANDARDS §4).
 * Feature services register here per milestone; none exist in M0.
 */
import type { ServiceContext } from "./context";

export { createServiceContext, type ServiceContext } from "./context";
export { checkReadiness, type ReadinessReport } from "./system";
export { resolvePrincipal, activateUser } from "./auth/session";
export { updateProfile, type UpdateProfileInput } from "./services/profile";
export { setRole, disableUser, enableUser } from "./services/admin";
export * from "./services/academic";
export * from "./services/people";
export * from "./services/attendance";
export * from "./services/exam";
export * from "./services/homework";
export * from "./services/report-card";
export * from "./services/timetable";
export * from "./services/notification";
export * from "./services/announcement";
export * from "./services/calendar";
export * from "./services/behaviour";
export * from "./services/fee";
export * from "./services/analytics";
export * from "./services/document";
export {
  assertCan,
  assertScope,
  assertSelf,
  assertSelfOrCan,
  ownsAccount,
  type Principal,
  type ScopeRule,
} from "./authorization";

export interface Services {
  // students: StudentService;     // M1
  // attendance: AttendanceService; // M2
  readonly _placeholder?: never;
}

/** Build the use-case services bound to a request's {@link ServiceContext}. */
export function createServices(_ctx: ServiceContext): Services {
  return {};
}
