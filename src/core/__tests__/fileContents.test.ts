import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  OPEN_PROBLEM,
  SIGNED_URL_SECONDS,
  filesOnSupabase,
  removeContents,
  signedUrl,
  uploadContents,
  uploadProblem,
} from '../fileContents';

/**
 * File contents on Storage (#161) against a stubbed client: which bucket and name a file goes
 * to, what the upload declares, how long a link lasts, and the sentence for each refusal.
 * db/fileContents.test.ts runs the same against the local Supabase.
 */

interface Call {
  op: string;
  bucket: string;
  args: unknown[];
}

function stub(answer: { data?: unknown; error?: unknown } = {}) {
  const calls: Call[] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        upload: (...args: unknown[]) => {
          calls.push({ op: 'upload', bucket, args });
          return Promise.resolve({ data: answer.data ?? {}, error: answer.error ?? null });
        },
        createSignedUrl: (...args: unknown[]) => {
          calls.push({ op: 'createSignedUrl', bucket, args });
          return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null });
        },
        remove: (...args: unknown[]) => {
          calls.push({ op: 'remove', bucket, args });
          return Promise.resolve({ data: [], error: answer.error ?? null });
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('file contents', () => {
  it('is not on Supabase when the build has no project', () => {
    expect(filesOnSupabase()).toBe(false);
  });

  it('uploads under the row id alone, declaring the format, never replacing', async () => {
    const { client, calls } = stub();
    const blob = new Blob(['x']);
    expect(await uploadContents('grant-files', 'file-7', blob, 'jpg', client)).toBeUndefined();
    expect(calls).toEqual([
      {
        op: 'upload',
        bucket: 'grant-files',
        args: ['file-7', blob, { contentType: 'image/jpeg', upsert: false }],
      },
    ]);
  });

  it('declares the type of each format, not whatever the browser guessed', async () => {
    for (const [format, type] of [
      ['pdf', 'application/pdf'],
      ['png', 'image/png'],
      ['heic', 'image/heic'],
    ] as const) {
      const { client, calls } = stub();
      await uploadContents('office-documents', 'docv-1', new Blob(['x']), format, client);
      expect(calls[0].args[2]).toMatchObject({ contentType: type });
    }
  });

  it('says why an upload failed, in plain words', async () => {
    const refused = { message: 'new row violates row-level security policy', statusCode: '403' };
    expect(
      await uploadContents(
        'grant-files',
        'a',
        new Blob(['x']),
        'pdf',
        stub({ error: refused }).client,
      ),
    ).toBe('Your role may not add this file.');
    expect(uploadProblem({ message: 'The object exceeded the maximum allowed size' })).toBe(
      'The file is too large.',
    );
    expect(uploadProblem({ message: 'mime type text/plain is not supported' })).toBe(
      'The file is not a PDF, JPG, PNG or HEIC.',
    );
    expect(uploadProblem({ message: 'The resource already exists', statusCode: '409' })).toBe(
      'That file was already uploaded.',
    );
    expect(uploadProblem(null)).toContain('did not go through');
  });

  it('turns a thrown upload into a sentence, not an exception', async () => {
    const client = {
      storage: {
        from: () => ({
          upload: () => Promise.reject(new Error('offline')),
        }),
      },
    } as unknown as SupabaseClient;
    expect(await uploadContents('grant-files', 'a', new Blob(['x']), 'pdf', client)).toContain(
      'did not go through',
    );
  });

  it('asks for a short-lived link, and a download link names the file', async () => {
    const { client, calls } = stub({ data: { signedUrl: 'http://x/y?token=1' } });
    expect(await signedUrl('office-documents', 'docv-1', {}, client)).toEqual({
      url: 'http://x/y?token=1',
    });
    await signedUrl('office-documents', 'docv-1', { download: 'W-9.pdf' }, client);
    expect(calls.map(c => c.args)).toEqual([
      ['docv-1', SIGNED_URL_SECONDS, {}],
      ['docv-1', SIGNED_URL_SECONDS, { download: 'W-9.pdf' }],
    ]);
    expect(SIGNED_URL_SECONDS).toBeLessThanOrEqual(3600);
  });

  it('gives one plain sentence when the rules refuse a link or the object is missing', async () => {
    const refused = stub({ error: { message: 'Object not found' } }).client;
    expect(await signedUrl('grant-files', 'file-1', {}, refused)).toEqual({ error: OPEN_PROBLEM });
    expect(await signedUrl('grant-files', 'file-1', {}, null)).toEqual({ error: OPEN_PROBLEM });
  });

  it('removes grant files’ objects by id, and not at all when there are none', async () => {
    const { client, calls } = stub();
    expect(await removeContents([], client)).toBeUndefined();
    expect(calls).toEqual([]);
    expect(await removeContents(['file-1', 'file-2'], client)).toBeUndefined();
    expect(calls).toEqual([{ op: 'remove', bucket: 'grant-files', args: [['file-1', 'file-2']] }]);
    const failing = stub({ error: { message: 'no' } }).client;
    expect(await removeContents(['file-1'], failing)).toContain('could not be removed');
  });
});
