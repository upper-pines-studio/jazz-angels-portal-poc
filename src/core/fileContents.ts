import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { FileFormat } from './types';

/**
 * File contents on Supabase Storage (#161, docs/SCHEMA.md "Buckets and object names").
 *
 * The row that describes a file (`FileFacts`) is saved through the store; its bytes go to a
 * private bucket under that row's id alone. When the portal does not run on Supabase (the demo, or
 * no project configured), `filesOnSupabase()` is false and nothing here is called: a file added in
 * a session is held in memory, as before.
 *
 * The functions take the client as the last argument so a test can hand in a stub; they default
 * to the portal's own.
 */

export type FileBucket = 'grant-files' | 'office-documents';

/** Whether file contents live in Supabase Storage. */
export function filesOnSupabase(): boolean {
  return supabase() !== null;
}

/** How long a signed link lasts: long enough to read a file, short enough to be no keepsake. */
export const SIGNED_URL_SECONDS = 600;

const CONTENT_TYPE: Record<FileFormat, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
};

interface StorageFailure {
  message?: string;
  statusCode?: string | number;
  status?: number;
  error?: string;
}

/** A plain sentence for why an upload failed. */
export function uploadProblem(e: StorageFailure | null | undefined): string {
  const text = `${e?.message ?? ''} ${e?.error ?? ''}`.toLowerCase();
  const code = String(e?.statusCode ?? e?.status ?? '');
  if (
    code === '403' ||
    code === '401' ||
    text.includes('row-level security') ||
    text.includes('unauthorized')
  )
    return 'Your role may not add this file.';
  if (text.includes('maximum allowed size') || code === '413') return 'The file is too large.';
  if (text.includes('mime type')) return 'The file is not a PDF, JPG, PNG or HEIC.';
  if (text.includes('already exists') || code === '409') return 'That file was already uploaded.';
  return 'The upload did not go through. Check the connection and try again.';
}

export const OPEN_PROBLEM =
  'This file could not be opened. Its contents may not have been uploaded, or your role may not open them.';

/** Upload a file's bytes under its row's id. Resolves to a sentence when it fails, else undefined. */
export async function uploadContents(
  bucket: FileBucket,
  id: string,
  file: Blob,
  format: FileFormat,
  client: SupabaseClient | null = supabase(),
): Promise<string | undefined> {
  if (!client) return 'The portal is not connected to its storage.';
  try {
    const { error } = await client.storage
      .from(bucket)
      .upload(id, file, { contentType: CONTENT_TYPE[format], upsert: false });
    return error ? uploadProblem(error as StorageFailure) : undefined;
  } catch {
    return uploadProblem(null);
  }
}

/**
 * A short-lived link to a file's contents, or the sentence saying why there is none. With
 * `download`, the link saves the file under that name instead of showing it.
 */
export async function signedUrl(
  bucket: FileBucket,
  id: string,
  opts: { download?: string } = {},
  client: SupabaseClient | null = supabase(),
): Promise<{ url: string } | { error: string }> {
  if (!client) return { error: OPEN_PROBLEM };
  try {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(id, SIGNED_URL_SECONDS, opts.download ? { download: opts.download } : {});
    if (error || !data?.signedUrl) return { error: OPEN_PROBLEM };
    return { url: data.signedUrl };
  } catch {
    return { error: OPEN_PROBLEM };
  }
}

/**
 * Remove grant files' objects. Storage lets a grant file's object go only while its row exists,
 * so this runs before the row is deleted. Resolves to a sentence when it fails. An object that is
 * not there is not a failure.
 */
export async function removeContents(
  ids: string[],
  client: SupabaseClient | null = supabase(),
): Promise<string | undefined> {
  if (!client || ids.length === 0) return undefined;
  try {
    const { error } = await client.storage.from('grant-files').remove(ids);
    return error ? 'The file could not be removed from storage. Try again.' : undefined;
  } catch {
    return 'The file could not be removed from storage. Try again.';
  }
}
