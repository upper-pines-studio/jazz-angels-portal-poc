import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isDemo } from './demo';

/**
 * The portal on Supabase (decision 0009). The build is given the project's address and its
 * publishable key as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; with both, and the
 * demo off, `supabase()` is the one client the browser uses. Otherwise it is null and the portal
 * keeps to the browser, as the demo does.
 *
 * Only the publishable key belongs here. The secret key stays in the Edge Functions' own
 * environment: a key that looks secret is refused, so a wrong `.env.local` never ships it.
 */

export interface SupabaseConfig {
  url: string;
  key: string;
}

/** Why a key is turned away, or null when it is a key the browser may hold. */
export function browserKeyProblem(key: string): string | null {
  if (key.startsWith('sb_secret_')) return 'a secret key';
  // A legacy key is a JWT; the service role one bypasses every row rule.
  const payload = key.split('.')[1];
  if (payload) {
    try {
      const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      if (claims?.role === 'service_role') return 'the service role key';
    } catch {
      // Not a JWT: a publishable key.
    }
  }
  return null;
}

/** The rule behind `supabase()`, given the two variables and the demo switch. */
export function supabaseFromEnv(
  url: string | undefined,
  key: string | undefined,
  demo: boolean,
): SupabaseConfig | null {
  const u = (url ?? '').trim();
  const k = (key ?? '').trim();
  if (demo || !u || !k) return null;
  if (browserKeyProblem(k)) return null;
  return { url: u, key: k };
}

let client: SupabaseClient | null | undefined;

/** The browser's Supabase client, or null when the portal does not run on Supabase. */
export function supabase(): SupabaseClient | null {
  if (client === undefined) {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const problem = key ? browserKeyProblem(key.trim()) : null;
    if (problem) {
      console.error(
        `VITE_SUPABASE_PUBLISHABLE_KEY holds ${problem}, which must never reach the browser. Use the publishable key.`,
      );
    }
    const config = supabaseFromEnv(import.meta.env.VITE_SUPABASE_URL, key, isDemo());
    client = config ? createClient(config.url, config.key) : null;
  }
  return client;
}
