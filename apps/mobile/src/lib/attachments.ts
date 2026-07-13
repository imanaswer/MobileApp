import { HOMEWORK_ATTACHMENT, STORAGE_BUCKETS } from "@repo/constants";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import { supabase } from "./supabase";

/**
 * Mobile homework-attachment upload (Phase 3). Mirrors the web flow
 * (apps/web/src/components/homework/ui.tsx): mint a signed upload URL → PUT bytes to
 * Supabase Storage → return metadata for the atomic submit. Same private bucket,
 * same allow-list as the server (ADR-004/ADR-013 §7) — the pre-check is a fast
 * error; the service re-validates.
 */

export interface PickedFile {
  uri: string;
  fileName: string;
  mimeType: string;
}

export interface AttachmentMeta {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

const fileNameFromUri = (uri: string): string => uri.split("/").pop() || "upload";

/** Client pre-check mirroring the service allow-list for a fast error. */
export function attachmentError(mimeType: string, sizeBytes: number): string | null {
  if (!(HOMEWORK_ATTACHMENT.ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return `File type not allowed: ${mimeType || "unknown"}`;
  }
  if (sizeBytes <= 0 || sizeBytes > HOMEWORK_ATTACHMENT.MAX_FILE_BYTES) {
    return "File exceeds the maximum allowed size";
  }
  return null;
}

export async function pickImage(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
  const asset = res.canceled ? undefined : res.assets[0];
  if (!asset) {
    return null;
  }
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? fileNameFromUri(asset.uri),
    mimeType: asset.mimeType ?? "image/jpeg",
  };
}

export async function pickDocument(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  const asset = res.canceled ? undefined : res.assets[0];
  if (!asset) {
    return null;
  }
  return {
    uri: asset.uri,
    fileName: asset.name,
    mimeType: asset.mimeType ?? "application/octet-stream",
  };
}

/**
 * Read the picked file, mint a signed URL for its real byte size, upload, and return
 * the metadata to persist. `mint` is bound by the caller to (homework, enrollment,
 * attempt); this stays UI-agnostic. Reading the bytes first guarantees a correct,
 * positive `sizeBytes` regardless of what the picker reported.
 */
export async function uploadSubmissionFile(
  file: PickedFile,
  mint: (args: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }) => Promise<{ storagePath: string; token: string }>,
): Promise<AttachmentMeta> {
  const buffer = await (await fetch(file.uri)).arrayBuffer();
  const sizeBytes = buffer.byteLength;
  const err = attachmentError(file.mimeType, sizeBytes);
  if (err) {
    throw new Error(err);
  }
  const { storagePath, token } = await mint({
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes,
  });
  const { error } = await supabase.storage
    .from(STORAGE_BUCKETS.HOMEWORK_FILES)
    .uploadToSignedUrl(storagePath, token, buffer, { contentType: file.mimeType });
  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
  return { storagePath, fileName: file.fileName, mimeType: file.mimeType, sizeBytes };
}
