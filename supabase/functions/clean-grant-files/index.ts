/**
 * clean-grant-files (#175; decision 0009): remove the `grant-files` objects no row points to.
 *
 * A grant file's bytes are `grant-files/<grant_files.id>` (#158). The portal removes them before
 * the row when a file is removed or an expense is deleted with its backup (#161), but a
 * transaction sent back, an expense removed another way, or an upload that landed after its row
 * was deleted leaves an object behind that nobody can open or remove. This finds each object older
 * than the grace period (rules.ts) whose name is no `grant_files.id`, and removes it.
 *
 * It goes through the Storage API with the secret key: Storage refuses a delete from
 * `storage.objects` in SQL ("Use the Storage API instead"), and a row deleted that way would leave
 * the bytes in the storage backend. Only this function holds the key, read from its own
 * environment; the browser never has it, and never calls this.
 *
 * Called by the `clean-grant-files` pg_cron job (migration `*_clean_grant_files.sql`) through
 * pg_net, with the secret key on `apikey`; anyone else is refused. `office-documents` is never
 * touched: a version's object is kept for good (#158).
 *
 * Answers `{ ok: true, checked, removed }` (removed: the object names), or `{ error }` with a
 * 4xx/5xx status. Nothing is removed unless every row lookup succeeded.
 */

import '@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from '@supabase/supabase-js';
import { orphans, pastGrace } from './rules.ts';
import type { StoredObject } from './rules.ts';

const BUCKET = 'grant-files';
const PAGE = 1000;
/** Names per row lookup and per remove: keeps the request's URL and body small. */
const BATCH = 100;

function answer(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Every secret key this function's project has: the new named keys, and the legacy one. */
function secretKeys(): string[] {
  const keys: string[] = [];
  const named = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (named) {
    try {
      keys.push(...Object.values(JSON.parse(named) as Record<string, string>));
    } catch {
      // Fall through to the legacy key.
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) keys.push(legacy);
  return keys.filter(Boolean);
}

/** Compare without stopping at the first difference, so the time says nothing about the key. */
function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** The secret key the request carries, on `apikey` or as a bearer token, or null. */
function callerKey(req: Request, keys: string[]): string | null {
  const offered = [
    req.headers.get('apikey') ?? '',
    /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1] ?? '',
  ];
  let found: string | null = null;
  for (const o of offered) for (const k of keys) if (o && same(o, k)) found = k;
  return found;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return answer(405, { error: 'Run the clean-up with POST.' });

  const keys = secretKeys();
  if (keys.length === 0)
    return answer(500, { error: 'No secret key in the function environment.' });
  const key = callerKey(req, keys);
  if (!key) return answer(401, { error: 'Only the scheduled clean-up may run this.' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Every object in the bucket, page by page. Names have no folder, so the root lists them all.
  const objects: StoredObject[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list('', { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) return answer(502, { error: `The bucket could not be listed: ${error.message}` });
    objects.push(...data.map(o => ({ name: o.name, created_at: o.created_at ?? null })));
    if (data.length < PAGE) break;
  }

  const candidates = pastGrace(objects, Date.now());
  const gone: string[] = [];
  for (let i = 0; i < candidates.length; i += BATCH) {
    const names = candidates.slice(i, i + BATCH);
    const { data, error } = await admin.from('grant_files').select('id').in('id', names);
    if (error) return answer(502, { error: `The grant files could not be read: ${error.message}` });
    gone.push(
      ...orphans(
        names,
        data.map(r => r.id as string),
      ),
    );
  }

  const removed: string[] = [];
  for (let i = 0; i < gone.length; i += BATCH) {
    const names = gone.slice(i, i + BATCH);
    const { data, error } = await admin.storage.from(BUCKET).remove(names);
    if (error) {
      return answer(502, { error: `Objects could not be removed: ${error.message}`, removed });
    }
    removed.push(...data.map(o => o.name));
  }

  return answer(200, { ok: true, checked: objects.length, removed });
});
