import React from 'react';
import {
  auth,
  choosePassword as savePassword,
  linkArrival,
  savedStaff,
  sendPasswordReset,
  signInWithEmail,
  supabase,
  whoSignedIn,
} from '../core';
import type { Arrival, AuthClient, AuthUser } from '../core';

/**
 * What a sign-in that did not go through says. `unreachable`: Supabase or the database did not
 * answer. `expired`: a session that ended by itself (it ran out, or the database stopped taking
 * it). `link-failed`: an emailed link that was used already or out of date.
 */
export type SignInRefusal =
  'mismatch' | 'no-staff' | 'archived' | 'unreachable' | 'expired' | 'link-failed';

/** Someone who followed an invitation's or a reset's link, and has a password to choose. */
export interface Choosing {
  email: string;
  /** Why: the first password (an invitation), or a new one (a reset). */
  kind: 'invite' | 'recovery';
}

export interface AuthContextValue {
  /**
   * `browser`: the demo's fixed logins, checked in this browser (auth.ts). `supabase`: email
   * and password through Supabase Auth (#160).
   */
  mode: 'browser' | 'supabase';
  /** False while a Supabase session is being restored; nothing shows until it is. */
  ready: boolean;
  user: AuthUser | null;
  /**
   * Null when the username (or email) and password match a login that belongs to a staff
   * record; the session is then saved. Otherwise why not, and nothing is saved.
   */
  signIn(username: string, password: string): Promise<SignInRefusal | null>;
  /** Pass a refusal to sign out with it showing on the login screen. */
  signOut(refusal?: SignInRefusal): void;
  /** Why the last sign-in, or the saved session, was turned away. */
  refusal: SignInRefusal | null;
  /** Set when an emailed link signed someone in who must choose a password first. */
  choosing: Choosing | null;
  /** Save the chosen password and go on in. Null when saved, else the sentence to show. */
  choosePassword(password: string, again: string): Promise<string | null>;
  /** Send a reset email (Supabase only). Null when it went, else the sentence to show. */
  sendReset(email: string): Promise<string | null>;
}

const AuthCtx = React.createContext<AuthContextValue | null>(null);

/**
 * Holds who is signed in. On Supabase (`supabase()` gives a client: the build has a project and
 * the demo is off) through Supabase Auth; otherwise with the fixed logins, exactly as before.
 * Tests pass `client` (a stub) and `arrival`.
 */
export function AuthProvider({
  children,
  client = supabase(),
  arrival,
}: {
  children: React.ReactNode;
  client?: AuthClient | null;
  arrival?: Arrival;
}) {
  return client ? (
    <SupabaseAuthProvider client={client} arrival={arrival === undefined ? linkArrival() : arrival}>
      {children}
    </SupabaseAuthProvider>
  ) : (
    <BrowserAuthProvider>{children}</BrowserAuthProvider>
  );
}

// --- The demo's fixed logins -------------------------------------------------

/**
 * The saved session, if it still belongs to someone on the staff list who is
 * not archived. An archived person's session is turned away like a sign-in.
 */
function restore(): { user: AuthUser | null; refusal: SignInRefusal | null } {
  const user = auth.currentUser();
  if (!user) return { user: null, refusal: null };
  const refused = auth.staffRefusal(user, savedStaff());
  if (!refused) return { user, refusal: null };
  // The session is ended in an effect, not here: React may run this twice in
  // development, and the second run must see the same session as the first.
  return { user: null, refusal: refused };
}

const noReset = async () => 'Ask an admin to reset your password.';
const noChoosing = async () => null;

/** Starts from the saved session so a reload stays signed in. */
function BrowserAuthProvider({ children }: { children: React.ReactNode }) {
  const [initial] = React.useState(restore);
  React.useEffect(() => {
    if (initial.refusal) auth.endSession();
  }, [initial]);
  const [user, setUser] = React.useState<AuthUser | null>(initial.user);
  const [refusal, setRefusal] = React.useState<SignInRefusal | null>(initial.refusal);

  const signIn = React.useCallback(async (username: string, password: string) => {
    const result = await auth.checkSignIn(username, password, savedStaff());
    if (!result.ok) {
      setRefusal(result.reason);
      return result.reason;
    }
    auth.startSession(result.user);
    setRefusal(null);
    setUser(result.user);
    return null;
  }, []);

  const signOut = React.useCallback((why?: SignInRefusal) => {
    auth.endSession();
    setRefusal(why ?? null);
    setUser(null);
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      mode: 'browser',
      ready: true,
      user,
      signIn,
      signOut,
      refusal,
      choosing: null,
      choosePassword: noChoosing,
      sendReset: noReset,
    }),
    [user, signIn, signOut, refusal],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// --- Supabase Auth -----------------------------------------------------------

/**
 * Kept in this tab while someone who followed an emailed link has not yet chosen their
 * password, so a reload asks again rather than letting them in without one.
 */
export const CHOOSING_KEY = 'ja-portal:choose-password';

function readChoosing(): Choosing['kind'] | null {
  try {
    const v = globalThis.sessionStorage?.getItem(CHOOSING_KEY);
    return v === 'invite' || v === 'recovery' ? v : null;
  } catch {
    return null;
  }
}

function writeChoosing(kind: Choosing['kind'] | null): void {
  try {
    if (kind) globalThis.sessionStorage?.setItem(CHOOSING_KEY, kind);
    else globalThis.sessionStorage?.removeItem(CHOOSING_KEY);
  } catch {
    // Private mode: the choice lasts as long as this page.
  }
}

/** Drop a failed link's error from the address bar, so a reload does not say it again. */
function clearLinkFromAddress(): void {
  try {
    if (typeof window === 'undefined' || !window.history) return;
    window.history.replaceState(null, '', window.location.pathname);
  } catch {
    // Nothing to tidy.
  }
}

type Phase =
  | { phase: 'checking' }
  | { phase: 'out'; refusal: SignInRefusal | null }
  | { phase: 'choosing'; user: AuthUser; choosing: Choosing }
  | { phase: 'in'; user: AuthUser };

/**
 * The person signed in to Supabase, as the staff record behind their `logins` row. The session
 * itself is supabase-js's: it keeps it in localStorage and refreshes it. When it ends without
 * the person signing out (the refresh is refused, the database stops taking it, another tab
 * signs out) the sign-in screen comes back and says so.
 */
function SupabaseAuthProvider({
  client,
  arrival,
  children,
}: {
  client: AuthClient;
  arrival: Arrival;
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<Phase>({ phase: 'checking' });
  // Set while this provider is the one ending the session, so its SIGNED_OUT is not news.
  const leaving = React.useRef(false);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const endSession = React.useCallback(
    async (refusal: SignInRefusal | null) => {
      leaving.current = true;
      writeChoosing(null);
      setState({ phase: 'out', refusal });
      try {
        await client.auth.signOut({ scope: 'local' });
      } finally {
        leaving.current = false;
      }
    },
    [client],
  );

  /** Where a signed-in session goes: a password to choose, in, or refused. */
  const settle = React.useCallback(
    async (email: string) => {
      const who = await whoSignedIn(client);
      if ('refusal' in who) {
        await endSession(who.refusal);
        return;
      }
      const user: AuthUser = { username: email, staffId: who.staffId };
      const kind = readChoosing();
      setState(
        kind ? { phase: 'choosing', user, choosing: { email, kind } } : { phase: 'in', user },
      );
    },
    [client, endSession],
  );

  // Restore the session (supabase-js has read any emailed link by the time getSession answers).
  React.useEffect(() => {
    let live = true;
    if (arrival?.kind === 'invite' || arrival?.kind === 'recovery') writeChoosing(arrival.kind);
    if (arrival?.kind === 'link-failed') clearLinkFromAddress();
    (async () => {
      const { data } = await client.auth.getSession();
      if (!live) return;
      const session = data.session;
      if (!session) {
        writeChoosing(null);
        setState({ phase: 'out', refusal: arrival?.kind === 'link-failed' ? 'link-failed' : null });
        return;
      }
      await settle(session.user.email ?? '');
    })().catch(() => {
      if (live) setState({ phase: 'out', refusal: 'unreachable' });
    });
    return () => {
      live = false;
    };
  }, [client, arrival, settle]);

  // A session that ends by itself, a reset link opened in this tab, and a fresh check of who
  // they are each time the token is refreshed (an archive shuts them out within the hour).
  React.useEffect(() => {
    const { data } = client.auth.onAuthStateChange((event, session) => {
      // Deferred: supabase-js holds its lock while it runs this callback.
      setTimeout(() => {
        const now = stateRef.current;
        if (event === 'SIGNED_OUT') {
          if (leaving.current || now.phase === 'out' || now.phase === 'checking') return;
          writeChoosing(null);
          setState({ phase: 'out', refusal: 'expired' });
        } else if (event === 'PASSWORD_RECOVERY' && session) {
          writeChoosing('recovery');
          void settle(session.user.email ?? '');
        } else if (event === 'TOKEN_REFRESHED' && session && now.phase !== 'out') {
          void whoSignedIn(client).then(who => {
            if ('refusal' in who && who.refusal !== 'unreachable') void endSession(who.refusal);
          });
        }
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [client, settle, endSession]);

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      leaving.current = true;
      try {
        const result = await signInWithEmail(client, email, password);
        if (!result.ok) {
          setState({ phase: 'out', refusal: result.reason });
          return result.reason;
        }
        writeChoosing(null);
        setState({ phase: 'in', user: { username: result.email, staffId: result.staffId } });
        return null;
      } finally {
        leaving.current = false;
      }
    },
    [client],
  );

  const signOut = React.useCallback(
    (why?: SignInRefusal) => void endSession(why ?? null),
    [endSession],
  );

  const choosePassword = React.useCallback(
    async (password: string, again: string) => {
      const problem = await savePassword(client, password, again);
      if (problem) return problem;
      writeChoosing(null);
      const now = stateRef.current;
      if (now.phase === 'choosing') setState({ phase: 'in', user: now.user });
      return null;
    },
    [client],
  );

  const sendReset = React.useCallback(
    (email: string) => sendPasswordReset(client, email, `${window.location.origin}/`),
    [client],
  );

  const value = React.useMemo<AuthContextValue>(
    () => ({
      mode: 'supabase',
      ready: state.phase !== 'checking',
      user: state.phase === 'in' ? state.user : null,
      signIn,
      signOut,
      refusal: state.phase === 'out' ? state.refusal : null,
      choosing: state.phase === 'choosing' ? state.choosing : null,
      choosePassword,
      sendReset,
    }),
    [state, signIn, signOut, choosePassword, sendReset],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider.');
  return ctx;
}
