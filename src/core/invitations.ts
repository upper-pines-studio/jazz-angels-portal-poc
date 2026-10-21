import type { SupabaseClient } from '@supabase/supabase-js';
import { isArchived } from './archive';
import type { Role, StaffMember } from './types';

/**
 * Sign-ins by invitation (decision 0001; #157), as the browser sees them when the portal runs on
 * Supabase. The `invite-staff` Edge Function sends the invitation and writes the `logins` row;
 * this reads those rows for Settings, asks the function to invite someone, and reads the
 * activity lines every Admin sees on the dashboard. Nothing here writes a table.
 */

/** A staff record's sign-in: a `logins` row. */
export interface SignIn {
  staffId: string;
  invitedBy: string;
  /** ISO timestamps. */
  invitedAt: string;
  acceptedAt: string | null;
}

/** A line of the activity log about a sign-in: an invitation sent, or one accepted. */
export interface SignInLine {
  id: string;
  /** The staff record that got the sign-in. */
  staffId: string;
  /** Who sent the invitation, or who accepted it. */
  whoId: string | null;
  at: string;
  event: 'invited' | 'accepted';
  text: string;
}

/** The roles with "Staff and roles" (decision 0001), who send invitations. */
const INVITERS: readonly Role[] = ['admin', 'director'];

/**
 * Whether `role` may send this record its invitation: the rules the function checks, so the
 * button shows only where the function would agree. An Admin's record waits for an Admin.
 */
export function mayInvite(role: Role, record: StaffMember, signIn: SignIn | undefined): boolean {
  return (
    INVITERS.includes(role) &&
    !isArchived(record) &&
    !!record.email &&
    !signIn &&
    (record.role !== 'admin' || role === 'admin')
  );
}

/** The `logins` rows the signed-in person may read (an Admin or a Director reads them all). */
export async function loadSignIns(client: SupabaseClient): Promise<SignIn[]> {
  const { data, error } = await client
    .from('logins')
    .select('staff_id, invited_by, invited_at, accepted_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    staffId: r.staff_id,
    invitedBy: r.invited_by,
    invitedAt: r.invited_at,
    acceptedAt: r.accepted_at,
  }));
}

/** The newest sign-in lines, newest first. */
export async function loadSignInLines(client: SupabaseClient, limit = 6): Promise<SignInLine[]> {
  const { data, error } = await client
    .from('activity')
    .select('id, subject_id, who_id, at, text, detail')
    .eq('subject_kind', 'staff')
    .order('at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    id: r.id,
    staffId: r.subject_id,
    whoId: r.who_id,
    at: r.at,
    event: r.detail?.event === 'accepted' ? 'accepted' : 'invited',
    text: r.text,
  }));
}

/**
 * Ask the `invite-staff` function to invite a staff record. The link in the email comes back to
 * `redirectTo`. Null when it went; otherwise the sentence to show.
 */
export async function sendInvitation(
  client: SupabaseClient,
  staffId: string,
  redirectTo: string,
): Promise<string | null> {
  const { error } = await client.functions.invoke('invite-staff', {
    body: { staffId, redirectTo },
  });
  if (!error) return null;
  // An answer from the function carries its sentence; anything else did not reach it.
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const body = (await context.json()) as { error?: unknown };
      if (typeof body.error === 'string') return body.error;
    } catch {
      // Not the function's own answer.
    }
  }
  return 'The invitation could not be sent. Check your connection and try again.';
}
