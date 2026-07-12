import type { DocumentStatusKey, DocumentTypeKey } from "@repo/types";
import { Text } from "react-native";

/** Shared labels + status bits for the M15 document screens (ADR-023). */

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

/** Types the office may GENERATE from data (the rest are typically uploaded). */
export const GENERATABLE_TYPES: DocumentTypeKey[] = [
  "BONAFIDE_CERTIFICATE",
  "STUDY_CERTIFICATE",
  "CHARACTER_CERTIFICATE",
  "TRANSFER_CERTIFICATE",
  "HALL_TICKET",
  "ID_CARD",
];

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatusKey, string> = {
  GENERATED: "Draft (generated)",
  UPLOADED: "Draft (uploaded)",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
};

const DOCUMENT_STATUS_CLASS: Record<DocumentStatusKey, string> = {
  GENERATED: "text-muted-foreground",
  UPLOADED: "text-muted-foreground",
  APPROVED: "text-success",
  ARCHIVED: "text-muted-foreground",
};

export function DocumentStatusText({ status }: { status: DocumentStatusKey }) {
  return (
    <Text className={`text-xs font-semibold ${DOCUMENT_STATUS_CLASS[status]}`}>
      {DOCUMENT_STATUS_LABEL[status]}
    </Text>
  );
}
