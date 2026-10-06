/**
 * Sign-in for the POC. There is no backend, so the check runs in the browser
 * against SHA-256 hashes of `${username}:${password}`; the passwords
 * themselves never appear in source or in the bundle. This keeps casual
 * visitors out of a published demo — it is not real security, and a Supabase
 * auth client replaces it when the portal gets a backend.
 *
 * A login is only a username and the staff record it belongs to (decision
 * 0001). The name and the role come from that record, so Settings is the one
 * place they change. A login whose staff record is missing is refused.
 *
 * The session is one localStorage key holding who signed in and when.
 */

import type { StaffMember } from './types';

export interface AuthUser {
  username: string;
  /** The staff record this login belongs to. */
  staffId: string;
}

/** A user plus the hex SHA-256 of `${username}:${password}`. */
export interface Credential extends AuthUser {
  hash: string;
}

export const SESSION_KEY = 'ja-portal:session:v1';

/**
 * One login per role in decision 0001. The role is on the staff record:
 * barry is a Director, intern an Office assistant, gwen the Admin, keisha the
 * Office manager, walt the Bookkeeper, devon a Teacher, margaret Read-only.
 */
export const USERS: readonly Credential[] = [
  {
    username: 'barry',
    staffId: 's-barry',
    hash: '49513554876aeb382676cc91f8215b057c0883aa952c04d09e0433ed70bfe29e',
  },
  {
    username: 'intern',
    staffId: 's-tess',
    hash: 'a6b514295aea232f50f533e3a42e5159878e6b2076d11be321afd6ed82f03ddb',
  },
  {
    username: 'gwen',
    staffId: 's-gwen',
    hash: 'a00c24f21e019c27a25fda763c0a201c9e33206cde772bd3051bb2ff4095a16f',
  },
  {
    username: 'keisha',
    staffId: 's-keisha',
    hash: 'f81c46cd920e4ac2c51458cadd0265b30af72aafe5ec13e7e5d51287f485690b',
  },
  {
    username: 'walt',
    staffId: 's-walt',
    hash: 'fb98b3745d813bc2d69f9726ebfa0336479880d1bf4f11fe12505a00817c73a9',
  },
  {
    username: 'devon',
    staffId: 's-devon',
    hash: '4e332da0ad61403f0359cb945f1a003efdf5bd34ffe85570059c89632ee484db',
  },
  {
    username: 'margaret',
    staffId: 's-margaret',
    hash: 'dc9b0c3990574ccc99cf664216d579a1a4e8d683a23b25b3a65cae8233d427d4',
  },
];

interface SessionRecord {
  username: string;
  signedInAt: string;
}

function storage(): Storage | undefined {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    // Touch it: Safari private mode throws on access rather than on read.
    if (!ls || typeof ls.getItem !== 'function') return undefined;
    return ls;
  } catch {
    return undefined;
  }
}

function normalise(username: string): string {
  return (username ?? '').trim().toLowerCase();
}

/** Strip the hash so it never travels further than this file. */
function publicUser(c: Credential): AuthUser {
  return { username: c.username, staffId: c.staffId };
}

/** Lowercase hex SHA-256 of `${username}:${password}`. */
export async function hashCredential(username: string, password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** The matching user without its hash, or null on any miss. */
export async function verify(
  username: string,
  password: string,
  users: readonly Credential[] = USERS,
): Promise<AuthUser | null> {
  try {
    const name = normalise(username);
    if (!name || !password) return null;
    const hit = users.find(u => normalise(u.username) === name);
    if (!hit) return null;
    const hash = await hashCredential(hit.username, password);
    return hash === hit.hash.toLowerCase() ? publicUser(hit) : null;
  } catch {
    return null;
  }
}

/** The staff record a login belongs to, or undefined when it is not there. */
export function staffFor(user: AuthUser, staff: readonly StaffMember[]): StaffMember | undefined {
  return staff.find(s => s.id === user.staffId);
}

export type SignInResult =
  | { ok: true; user: AuthUser; member: StaffMember }
  /** `mismatch`: wrong username or password. `no-staff`: right, but nobody to be. */
  | { ok: false; reason: 'mismatch' | 'no-staff' };

/**
 * The whole sign-in check: the password, then the staff record. Writes no
 * session; the caller starts one only on `ok`.
 */
export async function checkSignIn(
  username: string,
  password: string,
  staff: readonly StaffMember[],
  users: readonly Credential[] = USERS,
): Promise<SignInResult> {
  const user = await verify(username, password, users);
  if (!user) return { ok: false, reason: 'mismatch' };
  const member = staffFor(user, staff);
  if (!member) return { ok: false, reason: 'no-staff' };
  return { ok: true, user, member };
}

/** Whoever the stored session names, or null when there is none worth trusting. */
export function currentUser(users: readonly Credential[] = USERS): AuthUser | null {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionRecord> | null;
    if (!parsed || typeof parsed.username !== 'string') return null;
    const name = normalise(parsed.username);
    const hit = users.find(u => normalise(u.username) === name);
    return hit ? publicUser(hit) : null;
  } catch {
    return null;
  }
}

export function startSession(user: AuthUser): void {
  const ls = storage();
  if (!ls) return;
  const record: SessionRecord = { username: user.username, signedInAt: new Date().toISOString() };
  try {
    ls.setItem(SESSION_KEY, JSON.stringify(record));
  } catch {
    // Quota or private mode — the user stays signed in for this tab only.
  }
}

export function endSession(): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
