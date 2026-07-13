import type { StoragePort } from "@repo/api";
import { createHeadlessClient } from "@repo/auth";

import { env } from "@/src/env";

/**
 * Server-only `StoragePort` over Supabase Storage using the SERVICE-ROLE key
 * (never sent to clients). WHO may mint WHICH path is decided in the business
 * layer before these run (ADR-004); this adapter is pure plumbing. Buckets are
 * private — see RUNBOOK_SUPABASE_SETUP.md for provisioning.
 */
export function createStoragePort(): StoragePort {
  const supabase = createHeadlessClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE);

  return {
    async createSignedUploadUrl(bucket, path) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
      if (error) {
        throw new Error(`Could not create an upload URL: ${error.message}`);
      }
      return { signedUrl: data.signedUrl, token: data.token };
    },
    async createSignedDownloadUrl(bucket, path, expiresInSeconds) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds);
      if (error) {
        throw new Error(`Could not create a download URL: ${error.message}`);
      }
      return data.signedUrl;
    },
    async uploadObject(bucket, path, bytes, contentType) {
      const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
        contentType,
        upsert: true,
      });
      if (error) {
        throw new Error(`Could not upload the object: ${error.message}`);
      }
    },
  };
}
