import React from 'react';
import { auth, savedStaff } from '../core';
import type { AuthUser } from '../core';

/** What a sign-in that did not go through says. */
export type SignInRefusal = 'mismatch' | 'no-staff' | 'archived';

export interface AuthContextValue {
  user: AuthUser | null;
  /**
   * Null when the username and password match a login that belongs to a staff
   * record; the session is then saved. Otherwise why not, and nothing is saved.
   */
  signIn(username: string, password: string): Promise<SignInRefusal | null>;
  /** Pass a refusal to sign out with it showing on the login screen. */
  signOut(refusal?: SignInRefusal): void;
  /** Why the last sign-in, or the saved session, was turned away. */
  refusal: SignInRefusal | null;
}

const AuthCtx = React.createContext<AuthContextValue | null>(null);

/**
 * The saved session, if it still belongs to someone on the staff list who is
 * not archived. An archived person's session is turned away like a sign-in.
 */
function restore(): { user: AuthUser | null; refusal: SignInRefusal | null } {
  const user = auth.currentUser();
  if (!user) return { user: null, refusal: null };
  const refused = auth.staffRefusal(user, savedStaff());
  if (!refused) return { user, refusal: null };
  auth.endSession();
  return { user: null, refusal: refused };
}

/** Holds who is signed in. Starts from the saved session so a reload stays signed in. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initial] = React.useState(restore);
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

  const value = React.useMemo(
    () => ({ user, signIn, signOut, refusal }),
    [user, signIn, signOut, refusal],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider.');
  return ctx;
}
