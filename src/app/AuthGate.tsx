import React from 'react';
import { auth } from '../core';
import type { AuthUser } from '../core';

export interface AuthContextValue {
  user: AuthUser | null;
  /** True when the username and password match; the session is then saved. */
  signIn(username: string, password: string): Promise<boolean>;
  signOut(): void;
}

const AuthCtx = React.createContext<AuthContextValue | null>(null);

/** Holds who is signed in. Starts from the saved session so a reload stays signed in. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(() => auth.currentUser());

  const signIn = React.useCallback(async (username: string, password: string) => {
    const hit = await auth.verify(username, password);
    if (!hit) return false;
    auth.startSession(hit);
    setUser(hit);
    return true;
  }, []);

  const signOut = React.useCallback(() => {
    auth.endSession();
    setUser(null);
  }, []);

  const value = React.useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider.');
  return ctx;
}
