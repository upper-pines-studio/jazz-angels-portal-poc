/**
 * invite-staff (#157; decisions 0001 and 0009): send a staff record its invitation to sign in.
 *
 * Called from Settings with the signed-in person's session (`Authorization: Bearer <token>`) and
 * `{ staffId, redirectTo? }`. It checks the rules in rules.ts against the database, sends
 * Supabase's invite-by-email to the record's address (the person follows the link and chooses
 * their own password), then writes the `logins` row and the activity line every Admin sees,
 * through `public.record_invitation`, in one transaction.
 *
 * Only this function holds the secret key: it reads it from its own environment, which Supabase
 * fills in (locally from `supabase start`, hosted from the project). The browser never has it.
 *
 * Answers `{ ok: true, invitedAt }`, or `{ error }` with a sentence to show and a 4xx/5xx status.
 */

import '@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from '@supabase/supabase-js';
import { refusal } from './rules.ts';
import type { Caller, Invitee } from './rules.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function answer(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** The secret key: the new `default` secret key when there is one, else the service role key. */
function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const key = (JSON.parse(keys) as Record<string, string>).default;
      if (key) return key;
    } catch {
      // Fall through to the legacy key.
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error('No secret key in the function environment.');
  return legacy;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return answer(405, { error: 'Send the invitation with POST.' });

  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1];
  if (!token) return answer(401, { error: 'Sign in again to send an invitation.' });

  let staffId: unknown;
  let redirectTo: unknown;
  try {
    ({ staffId, redirectTo } = await req.json());
  } catch {
    return answer(400, { error: 'The request did not say who to invite.' });
  }
  if (typeof staffId !== 'string' || !staffId) {
    return answer(400, { error: 'The request did not say who to invite.' });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Who is asking: their Supabase user, then their login and current staff record.
  const { data: who, error: whoError } = await admin.auth.getUser(token);
  if (whoError || !who.user) return answer(401, { error: 'Sign in again to send an invitation.' });

  const { data: callerLogin } = await admin
    .from('logins')
    .select('staff_id')
    .eq('auth_user_id', who.user.id)
    .maybeSingle();
  let caller: (Caller & { id: string }) | null = null;
  if (callerLogin) {
    const { data } = await admin
      .from('staff')
      .select('id, role')
      .eq('id', callerLogin.staff_id)
      .is('archived_at', null)
      .maybeSingle();
    caller = data;
  }

  const { data: invitee } = await admin
    .from('staff')
    .select('name, role, email, archived_at')
    .eq('id', staffId)
    .maybeSingle<Invitee>();
  const { count } = await admin
    .from('logins')
    .select('staff_id', { count: 'exact', head: true })
    .eq('staff_id', staffId);

  const refused = refusal(caller, invitee, (count ?? 0) > 0);
  if (refused) return answer(refused.status, { error: refused.error });

  // Supabase makes the user and sends the email. A redirect not on the project's allow list is
  // replaced by the site URL, so the link always comes back to the portal.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    invitee!.email!,
    typeof redirectTo === 'string' && redirectTo ? { redirectTo } : undefined,
  );
  if (inviteError || !invited.user) {
    const taken = inviteError?.code === 'email_exists' || inviteError?.status === 422;
    return answer(taken ? 409 : 502, {
      error: taken
        ? `${invitee!.email} already has a Supabase account that isn't tied to a staff record. Ask whoever runs the system to remove it, then send the invitation again.`
        : `The invitation email could not be sent: ${inviteError?.message ?? 'no user came back'}.`,
    });
  }

  const { error: recordError } = await admin.rpc('record_invitation', {
    auth_user_id: invited.user.id,
    staff_id: staffId,
    invited_by: caller!.id,
  });
  if (recordError) {
    // Leave nothing half done: without its login the account could never be used.
    await admin.auth.admin.deleteUser(invited.user.id);
    return answer(500, { error: `The invitation was not saved: ${recordError.message}` });
  }

  return answer(200, { ok: true, invitedAt: new Date().toISOString() });
});
