/**
 * Sign-in for the POC. There is no backend, so the check runs in the browser
 * against SHA-256 hashes of `${username}:${password}`; the passwords
 * themselves never appear in source or in the bundle. This keeps casual
 * visitors out of a published demo — it is not real security, and a Supabase
 * auth client replaces it when the portal gets a backend.
 *
 * The session is one localStorage key holding who signed in and when.
 */

export interface AuthUser {
  username: string;
  name: string;
  role: string;
  staffId?: string;
}

/** A user plus the hex SHA-256 of `${username}:${password}`. */
export interface Credential extends AuthUser {
  hash: string;
}

export const SESSION_KEY = 'ja-portal:session:v1';

export const USERS: readonly Credential[] = [
  {
    username: 'barry',
    name: 'Barry Cogert',
    role: 'Program Director',
    staffId: 's-barry',
    hash: '49513554876aeb382676cc91f8215b057c0883aa952c04d09e0433ed70bfe29e',
  },
  {
    username: 'intern',
    name: 'Office Intern',
    role: 'Intern',
    hash: 'a6b514295aea232f50f533e3a42e5159878e6b2076d11be321afd6ed82f03ddb',
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
  const user: AuthUser = { username: c.username, name: c.name, role: c.role };
  if (c.staffId !== undefined) user.staffId = c.staffId;
  return user;
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
