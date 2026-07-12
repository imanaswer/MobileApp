import type { Document, DocumentTemplate } from "@repo/db";
import type {
  DocumentDto,
  DocumentSnapshot,
  DocumentStatusKey,
  DocumentTemplateDto,
  DocumentTypeKey,
  IsoUtcString,
  IstDateString,
} from "@repo/types";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // Asia/Kolkata, no DST (fee/mappers precedent)

const iso = (d: Date): IsoUtcString => d.toISOString() as IsoUtcString;

/** Today's IST calendar date — the certificate's issue date (ADR-023 §3). */
export function istToday(): IstDateString {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10) as IstDateString;
}

export function mapDocument(d: Document): DocumentDto {
  return {
    id: d.id,
    schoolId: d.schoolId,
    studentId: d.studentId,
    type: d.type as DocumentTypeKey,
    status: d.status as DocumentStatusKey,
    templateId: d.templateId,
    // snapshotJson is frozen at generate; null for UPLOADED docs (ADR-023 §3).
    snapshot: (d.snapshotJson as unknown as DocumentSnapshot | null) ?? null,
    hasFile: d.storagePath != null, // a metadata-only GENERATED doc has none yet (§3)
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    approvedAt: d.approvedAt ? iso(d.approvedAt) : null,
    archivedAt: d.archivedAt ? iso(d.archivedAt) : null,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export function mapTemplate(t: DocumentTemplate): DocumentTemplateDto {
  return {
    id: t.id,
    schoolId: t.schoolId,
    type: t.type as DocumentTypeKey,
    name: t.name,
    active: t.active,
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}
