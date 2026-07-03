import { withTransaction, type Repositories } from "@repo/db";
import { createNotificationService, type NotificationService } from "@repo/notifications";

import type { Principal } from "./authorization";
import { repositories } from "./repositories";

/**
 * Everything a use-case service needs: the authenticated authorization context
 * (a DB-built {@link Principal}), the data-access boundary (repositories), the
 * notification abstraction, and `withTransaction` for atomic mutation+audit
 * (DATABASE_CONVENTIONS §11). Services enforce permission + scope here (ADR-002).
 */
export interface ServiceContext {
  user: Principal;
  repositories: Repositories;
  notifications: NotificationService;
  withTransaction: typeof withTransaction;
}

// No notification adapters are wired in M1 (auth sends nothing); the Notifications
// milestone registers real adapters. An empty service is a safe no-op here.
const notifications = createNotificationService([]);

/** Assemble a per-request {@link ServiceContext} for a resolved principal. */
export function createServiceContext(user: Principal): ServiceContext {
  return { user, repositories, notifications, withTransaction };
}
