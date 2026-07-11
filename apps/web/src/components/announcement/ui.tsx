import { ANNOUNCEMENT_ATTACHMENT, STORAGE_BUCKETS } from "@repo/constants";
import type {
  AnnouncementScopeKey,
  AnnouncementStatusKey,
  CalendarEventTypeKey,
} from "@repo/types";

import { getSupabaseClient } from "@/src/lib/supabase/client";

export const SCOPE_LABEL: Record<AnnouncementScopeKey, string> = {
  WHOLE_SCHOOL: "Whole school",
  CLASS: "Class",
  SECTION: "Section",
  TEACHERS: "Teachers",
  PARENTS: "Parents",
};

export const STATUS_LABEL: Record<AnnouncementStatusKey, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const EVENT_TYPE_LABEL: Record<CalendarEventTypeKey, string> = {
  HOLIDAY: "Holiday",
  EVENT: "Event",
  EXAM: "Exam",
  MEETING: "Meeting",
  OTHER: "Other",
};

export const CALENDAR_EVENT_TYPES: CalendarEventTypeKey[] = [
  "HOLIDAY",
  "EVENT",
  "EXAM",
  "MEETING",
  "OTHER",
];

/** YYYY-MM-DD or ISO → a short human date. */
export function formatDate(value: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const kb = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Client-side claimed-file validation, mirroring the M11 business ceiling. */
export function validateAnnouncementFile(file: File): string | null {
  if (!ANNOUNCEMENT_ATTACHMENT.ALLOWED_MIME_TYPES.includes(file.type)) {
    return `File type not allowed: ${file.type || "unknown"}`;
  }
  if (file.size <= 0 || file.size > ANNOUNCEMENT_ATTACHMENT.MAX_FILE_BYTES) {
    return "File exceeds the maximum allowed size";
  }
  return null;
}

/** Push bytes to a server-minted signed upload URL for the announcement bucket. */
export async function pushAnnouncementFile(
  storagePath: string,
  token: string,
  file: File,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .storage.from(STORAGE_BUCKETS.ANNOUNCEMENT_ATTACHMENTS)
    .uploadToSignedUrl(storagePath, token, file);
  if (error) {
    throw new Error(`File upload failed: ${error.message}`);
  }
}
