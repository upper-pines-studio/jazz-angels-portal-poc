import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sign-in through Supabase Auth (#160; decision 0009), when the portal runs on Supabase. The
 * demo keeps the fixed logins in auth.ts.
 *
 * People sign in with their email and the password they chose. Supabase checks the password; the
 * portal then asks the database who that account is (`public.signed_in_staff()`, through the
 * `logins` row) and refuses, as auth.ts does, an account with no staff record and one whose
 * record is archived. The signed-in person is that staff record: there is no second login.
 *
 * An invitation's link (#157) and a reset's link come back to the portal signed in; the person
 * then chooses a password before going on. Each function here answers with a refusal or a
 * sentence to show, never a thrown error, so the screens only have to say it.
 */

/** What Supabase's auth calls need; the tests hand it a stub. */
export type AuthClient = Pick<SupabaseClient, 'auth' | 'rpc'>;

/** Why a sign-in through Supabase did not go through. */
export type SupabaseRefusal = 'mismatch' | 'no-staff' | 'archived' | 'unreachable' | 'expired';

/**
 * Who the signed-in account is: their staff record, or why they may not go on. `expired`: the
 * database no longer takes the session's token.
 */
export type Who =
  { staffId: string } | { refusal: 'no-staff' | 'archived' | 'unreachable' | 'expired' };

/**
 * PostgREST's codes for a token it will not take (PGRST301–303: unreadable, missing, expired).
 * The session is over as far as the database is concerned.
 */
export function sessionRefused(error: { code?: string }): boolean {
  return /^PGRST30[0-9]$/.test(error.code ?? '');
}

/**
 * How the page was reached from an emailed link: an invitation (#157), a reset, or a link that
 * did not work (used already, or out of date). Null for anything else.
 */
export type Arrival = { kind: 'invite' } | { kind: 'recovery' } | { kind: 'link-failed' } | null;

/** The link's kind, from the address Supabase sent the person back to. */
export function arrivalFrom(hash: string, search = ''): Arrival {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const query = new URLSearchParams(search.replace(/^\?/, ''));
  if (params.get('error') || params.get('error_code') || query.get('error_code')) {
    return { kind: 'link-failed' };
  }
  if (!params.get('access_token')) return null;
  const type = params.get('type');
  if (type === 'invite') return { kind: 'invite' };
  if (type === 'recovery') return { kind: 'recovery' };
  return null;
}

/** The staff record behind the account signed in to `client`. */
export async function whoSignedIn(client: AuthClient): Promise<Who> {
  const { data, error } = await client.rpc('signed_in_staff');
  if (error) return { refusal: sessionRefused(error) ? 'expired' : 'unreachable' };
  const row = (data as { staff_id: string; archived: boolean }[] | null)?.[0];
  if (!row) return { refusal: 'no-staff' };
  if (row.archived) return { refusal: 'archived' };
  return { staffId: row.staff_id };
}

export type EmailSignIn =
  { ok: true; staffId: string; email: string } | { ok: false; reason: SupabaseRefusal };

/**
 * Sign in with an email and password, then find the staff record. A refused account is signed
 * straight out again, so no session is left behind for someone who may not use the portal.
 */
export async function signInWithEmail(
  client: AuthClient,
  email: string,
  password: string,
): Promise<EmailSignIn> {
  const address = email.trim();
  if (!address || !password) return { ok: false, reason: 'mismatch' };
  let session;
  try {
    const { data, error } = await client.auth.signInWithPassword({ email: address, password });
    if (error) {
      // A wrong password, an unknown address, or an invitation not yet accepted all read alike.
      const credential =
        error.code === 'invalid_credentials' ||
        error.code === 'email_not_confirmed' ||
        error.status === 400;
      return { ok: false, reason: credential ? 'mismatch' : 'unreachable' };
    }
    session = data.session;
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (!session) return { ok: false, reason: 'unreachable' };
  const who = await whoSignedIn(client);
  if ('refusal' in who) {
    await client.auth.signOut({ scope: 'local' });
    return { ok: false, reason: who.refusal };
  }
  return { ok: true, staffId: who.staffId, email: session.user.email ?? address };
}

/**
 * Send Supabase's reset email; its link comes back to `redirectTo`. Supabase answers the same
 * whether or not the address has an account, so nobody learns who has one. Null when it went.
 */
export async function sendPasswordReset(
  client: AuthClient,
  email: string,
  redirectTo: string,
): Promise<string | null> {
  const address = email.trim();
  if (!address) return 'Enter the email you sign in with.';
  try {
    const { error } = await client.auth.resetPasswordForEmail(address, { redirectTo });
    if (!error) return null;
    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      return 'A link was sent a moment ago. Wait a minute, then ask again.';
    }
    if (error.code === 'validation_failed' || error.code === 'email_address_invalid') {
      return 'That doesn’t look like an email address.';
    }
  } catch {
    // Fall through: it did not reach Supabase.
  }
  return 'The email could not be sent. Check your connection and try again.';
}

/** Save the password the signed-in person chose. Null when it is saved, else what to fix. */
export async function choosePassword(
  client: AuthClient,
  password: string,
  again: string,
): Promise<string | null> {
  if (!password) return 'Choose a password.';
  if (password !== again) return 'The two passwords don’t match.';
  try {
    const { error } = await client.auth.updateUser({ password });
    if (!error) return null;
    if (error.code === 'weak_password') return error.message;
    if (error.code === 'same_password')
      return 'That is the password you have now. Choose a new one.';
    if (
      error.code === 'session_not_found' ||
      error.code === 'session_expired' ||
      error.status === 401
    ) {
      return 'The link has run out. Use Forgot your password on the sign-in screen for a new one.';
    }
  } catch {
    // Fall through: it did not reach Supabase.
  }
  return 'Your password was not saved. Check your connection and try again.';
}
