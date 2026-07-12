/**
 * @repo/constants — cross-cutting config constants only (no logic, no business data).
 * Configurable domain data (e.g. grade bands) lives in the DB, never here. ADR-006.
 */

/** Supported deployment environments (Dev PRD §11). */
export const APP_ENVS = ["development", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** Supported UI locales — English + Malayalam (Dev PRD §2). */
export const LOCALES = ["en", "ml"] as const;
export type LocaleCode = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: LocaleCode = "en";

/** User roles (fixed set) — see ./roles. */
export * from "./roles";

/** Permission catalog + Role → Permissions policy — see ./permissions. */
export * from "./permissions";

/** User lifecycle statuses (Dev PRD §8.1). Mirrored as the Prisma `UserStatus` enum. */
export const USER_STATUSES = ["INVITED", "ACTIVE", "DISABLED"] as const;
export type UserStatusKey = (typeof USER_STATUSES)[number];

/** Notification channels (ADR-005). Mirrored as a Prisma enum in M1. */
export const NOTIFICATION_CHANNELS = ["IN_APP", "PUSH", "SMS", "WHATSAPP"] as const;
export type NotificationChannelKey = (typeof NOTIFICATION_CHANNELS)[number];

/** Add-on feature-flag keys (ADR-006). Core capabilities are always on, never flagged. */
export const FEATURE_FLAGS = {
  FEES: "fees",
  WHATSAPP: "whatsapp",
  TIMETABLE: "timetable",
  ANALYTICS: "analytics",
  OFFLINE: "offline",
} as const;
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/** Pagination defaults (API_CONVENTIONS.md §8). */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Canonical timezone — store UTC, render IST (Dev PRD §2). */
export const APP_TIMEZONE = "Asia/Kolkata";

/**
 * Private Supabase Storage buckets (ADR-004). Bytes are never publicly
 * addressable — access is via short-lived signed URLs minted server-side after
 * a business-layer authz check. Paths are namespaced by `schoolId/…`.
 */
export const STORAGE_BUCKETS = {
  STUDENT_DOCUMENTS: "student-documents",
  /** Homework teacher/parent attachments (M6, ADR-013 §9). Provisioned via runbook. */
  HOMEWORK_FILES: "homework-files",
  /** Announcement attachments (M11, ADR-019 §8). Private; provisioned via runbook. */
  ANNOUNCEMENT_ATTACHMENTS: "announcement-attachments",
  /** Issued/uploaded certificates & documents (M15, ADR-023 §1). Private; signed
   * 60s on read; provisioned via runbook. Distinct from STUDENT_DOCUMENTS (M3 KYC). */
  DOCUMENTS: "documents",
  /** School branding logo (M16, ADR-024 §1). Private; signed on read; provisioned
   * via runbook. logoPath stored on BrandingSettings; never a public URL. */
  BRANDING: "branding",
} as const;
export type StorageBucketKey = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

/**
 * Homework attachment upload constraints (M6, ADR-013 §7). Validated at mint time,
 * before a signed URL exists — the client's claimed mimeType/sizeBytes are checked,
 * not the real bytes (ADR-004 accepts that ceiling; the bucket is private).
 */
export const HOMEWORK_ATTACHMENT = {
  /** Max bytes per file (25 MB — a scanned worksheet / photo set). */
  MAX_FILE_BYTES: 25 * 1024 * 1024,
  /** Max attachments per homework (teacher) or per submission attempt (parent). */
  MAX_FILES: 10,
  /** Allowed MIME types — documents + images (no executables/archives). */
  ALLOWED_MIME_TYPES: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ] as readonly string[],
} as const;

/**
 * Announcement attachment upload constraints (M11, ADR-019 §8). Same mint-time
 * ceiling posture as {@link HOMEWORK_ATTACHMENT} — documents + images, private bucket.
 */
export const ANNOUNCEMENT_ATTACHMENT = {
  /** Max bytes per file (25 MB — a scanned circular / notice). */
  MAX_FILE_BYTES: 25 * 1024 * 1024,
  /** Max attachments per announcement. */
  MAX_FILES: 10,
  /** Allowed MIME types — documents + images (no executables/archives). */
  ALLOWED_MIME_TYPES: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ] as readonly string[],
} as const;
