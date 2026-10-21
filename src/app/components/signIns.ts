import React from 'react';
import { loadSignIns, loadSignInLines, sendInvitation, supabase } from '../../core';
import type { SignIn, SignInLine } from '../../core';

/**
 * The sign-ins Settings and the dashboard show when the portal runs on Supabase (#157).
 *
 * - `off`: not on Supabase (the demo, or no project given): nothing about sign-ins shows.
 * - `signed-out`: on Supabase, but this browser has no Supabase session yet, so the database
 *   answers nothing. The sign-in screen (#160) makes the session, so this shows only if it ends.
 * - `loading`, `ready`, `failed`: reading what the session may read.
 */
export type SignInsStatus = 'off' | 'signed-out' | 'loading' | 'ready' | 'failed';

/** Runs `read` with the Supabase client whenever the session changes. */
function useSupabaseRead<T>(
  on: boolean,
  read: (c: NonNullable<ReturnType<typeof supabase>>) => Promise<T>,
) {
  const client = on ? supabase() : null;
  const [status, setStatus] = React.useState<SignInsStatus>(client ? 'loading' : 'off');
  const [value, setValue] = React.useState<T | undefined>();
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange(event => {
      if (event !== 'TOKEN_REFRESHED') setTick(t => t + 1);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  React.useEffect(() => {
    if (!client) return;
    let live = true;
    (async () => {
      const { data } = await client.auth.getSession();
      if (!live) return;
      if (!data.session) {
        setStatus('signed-out');
        return;
      }
      try {
        const next = await read(client);
        if (!live) return;
        setValue(next);
        setStatus('ready');
      } catch {
        if (live) setStatus('failed');
      }
    })();
    return () => {
      live = false;
    };
  }, [client, tick]);

  return { status, value, reload: () => setTick(t => t + 1), client };
}

/** Every staff record's sign-in, by staff id, and a way to send an invitation. */
export function useSignIns(on: boolean) {
  const { status, value, reload, client } = useSupabaseRead(on, loadSignIns);
  const byStaff = React.useMemo(
    () => new Map<string, SignIn>((value ?? []).map(s => [s.staffId, s])),
    [value],
  );
  async function invite(staffId: string): Promise<string | null> {
    if (!client) return 'This portal is not connected to its database.';
    const refused = await sendInvitation(client, staffId, `${window.location.origin}/`);
    if (!refused) reload();
    return refused;
  }
  return { status, byStaff, invite };
}

/** The newest lines about invitations sent and accepted. */
export function useSignInLines(on: boolean) {
  const { status, value } = useSupabaseRead(on, c => loadSignInLines(c));
  return { status, lines: value ?? ([] as SignInLine[]) };
}
