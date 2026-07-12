import type { DocumentStatusKey, DocumentTypeKey } from "@repo/types";

/** Shared labels + status bits for the M15 document console (ADR-023). */

export const DOCUMENT_TYPE_LABEL: Record<DocumentTypeKey, string> = {
  BONAFIDE_CERTIFICATE: "Bonafide certificate",
  STUDY_CERTIFICATE: "Study certificate",
  CHARACTER_CERTIFICATE: "Character certificate",
  TRANSFER_CERTIFICATE: "Transfer certificate",
  FEE_RECEIPT: "Fee receipt",
  REPORT_CARD: "Report card",
  HALL_TICKET: "Hall ticket",
  ID_CARD: "ID card",
  OTHER: "Other",
};

export const CERT_TYPES: readonly DocumentTypeKey[] = [
  "BONAFIDE_CERTIFICATE",
  "STUDY_CERTIFICATE",
  "CHARACTER_CERTIFICATE",
  "TRANSFER_CERTIFICATE",
  "FEE_RECEIPT",
  "REPORT_CARD",
  "HALL_TICKET",
  "ID_CARD",
  "OTHER",
];

/** Types the office GENERATES from data (metadata-first). Receipts/report cards are uploaded. */
export const GENERATABLE_TYPES: readonly DocumentTypeKey[] = [
  "BONAFIDE_CERTIFICATE",
  "STUDY_CERTIFICATE",
  "CHARACTER_CERTIFICATE",
  "TRANSFER_CERTIFICATE",
  "HALL_TICKET",
  "ID_CARD",
];

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatusKey, string> = {
  GENERATED: "Generated (draft)",
  UPLOADED: "Uploaded (draft)",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
};

export const DOCUMENT_STATUSES: readonly DocumentStatusKey[] = [
  "GENERATED",
  "UPLOADED",
  "APPROVED",
  "ARCHIVED",
];

const STATUS_CLASS: Record<DocumentStatusKey, string> = {
  GENERATED: "bg-muted text-muted-foreground",
  UPLOADED: "bg-muted text-muted-foreground",
  APPROVED: "bg-success/10 text-success",
  ARCHIVED: "bg-muted text-muted-foreground",
};

export function DocumentStatusBadge({ status }: { status: DocumentStatusKey }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {DOCUMENT_STATUS_LABEL[status]}
    </span>
  );
}
