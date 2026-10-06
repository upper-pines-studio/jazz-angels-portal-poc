import { beforeEach, describe, expect, it } from 'vitest';
import {
  currentUser,
  endSession,
  hashCredential,
  SESSION_KEY,
  startSession,
  USERS,
  verify,
} from '../auth';
import type { Credential } from '../auth';

/** Minimal in-memory localStorage so the module can be exercised in node. */
function installStorage() {
  const data = new Map<string, string>();
  const ls: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: k => data.get(k) ?? null,
    key: i => Array.from(data.keys())[i] ?? null,
    removeItem: k => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
  (globalThis as { localStorage?: Storage }).localStorage = ls;
  return { data, ls };
}

beforeEach(() => {
  installStorage();
});

describe('hashCredential', () => {
  it('is deterministic and 64-char lowercase hex', async () => {
    const hash = await hashCredential('tester', 'some-test-password');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashCredential('tester', 'some-test-password')).toBe(hash);
  });

  it('differs when the username changes', async () => {
    const a = await hashCredential('tester', 'some-test-password');
    const b = await hashCredential('other', 'some-test-password');
    expect(a).not.toBe(b);
  });

  it('differs when the password changes', async () => {
    const a = await hashCredential('tester', 'some-test-password');
    const b = await hashCredential('tester', 'some-other-password');
    expect(a).not.toBe(b);
  });
});

describe('verify', () => {
  async function buildTestUsers(): Promise<readonly Credential[]> {
    return [
      {
        username: 'tester',
        name: 'Test Person',
        role: 'Tester',
        hash: await hashCredential('tester', 'some-test-password'),
      },
    ];
  }

  it('succeeds for the right username and password', async () => {
    const users = await buildTestUsers();
    const user = await verify('tester', 'some-test-password', users);
    expect(user).not.toBeNull();
    expect(user?.name).toBe('Test Person');
    expect(user?.role).toBe('Tester');
    expect(user).not.toHaveProperty('hash');
  });

  it('is case-insensitive and trims whitespace on the username', async () => {
    const users = await buildTestUsers();
    expect(await verify('TESTER', 'some-test-password', users)).not.toBeNull();
    expect(await verify('  tester  ', 'some-test-password', users)).not.toBeNull();
  });

  it('fails on the wrong password', async () => {
    const users = await buildTestUsers();
    expect(await verify('tester', 'wrong-password', users)).toBeNull();
  });

  it('fails on a wrong-case password (passwords are case-sensitive)', async () => {
    const users = await buildTestUsers();
    expect(await verify('tester', 'SOME-TEST-PASSWORD', users)).toBeNull();
  });

  it('fails on an unknown username', async () => {
    const users = await buildTestUsers();
    expect(await verify('nobody', 'some-test-password', users)).toBeNull();
  });

  it('fails on empty strings without throwing', async () => {
    const users = await buildTestUsers();
    await expect(verify('', '', users)).resolves.toBeNull();
    await expect(verify('tester', '', users)).resolves.toBeNull();
    await expect(verify('', 'some-test-password', users)).resolves.toBeNull();
  });
});

describe('the real USERS table', () => {
  it('has exactly two entries for barry and intern', () => {
    expect(USERS).toHaveLength(2);
    expect(USERS.map(u => u.username).sort()).toEqual(['barry', 'intern']);
  });

  it('stores only a 64-char lowercase hex hash, never a plaintext password', () => {
    for (const entry of USERS) {
      expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(entry).not.toHaveProperty('password');
      expect(entry).not.toHaveProperty('plaintext');
    }
  });

  it('rejects a wrong password and an empty password for a real user', async () => {
    expect(await verify('barry', 'wrong')).toBeNull();
    expect(await verify('barry', '')).toBeNull();
  });
});

describe('session', () => {
  const testUsers: readonly Credential[] = [
    { username: 'tester', name: 'Test Person', role: 'Tester', hash: 'unused' },
  ];

  it('round-trips startSession through currentUser', () => {
    startSession({ username: 'tester', name: 'Test Person', role: 'Tester' });
    const user = currentUser(testUsers);
    expect(user).toEqual({ username: 'tester', name: 'Test Person', role: 'Tester' });
  });

  it('stores username and an ISO signedInAt in the session key', () => {
    startSession({ username: 'tester', name: 'Test Person', role: 'Tester' });
    const raw = globalThis.localStorage!.getItem(SESSION_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.username).toBe('tester');
    expect(typeof parsed.signedInAt).toBe('string');
    expect(new Date(parsed.signedInAt).toISOString()).toBe(parsed.signedInAt);
  });

  it('returns null when the key is missing', () => {
    expect(currentUser(testUsers)).toBeNull();
  });

  it('returns null for garbage JSON', () => {
    globalThis.localStorage!.setItem(SESSION_KEY, '{{{not json');
    expect(currentUser(testUsers)).toBeNull();
  });

  it('returns null when the stored username is not in the table', () => {
    globalThis.localStorage!.setItem(
      SESSION_KEY,
      JSON.stringify({ username: 'nobody', signedInAt: new Date().toISOString() }),
    );
    expect(currentUser(testUsers)).toBeNull();
  });

  it('endSession removes the key', () => {
    startSession({ username: 'tester', name: 'Test Person', role: 'Tester' });
    endSession();
    expect(globalThis.localStorage!.getItem(SESSION_KEY)).toBeNull();
    expect(currentUser(testUsers)).toBeNull();
  });

  it('does not throw and returns null when localStorage is unavailable', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(() =>
      startSession({ username: 'tester', name: 'Test Person', role: 'Tester' }),
    ).not.toThrow();
    expect(() => endSession()).not.toThrow();
    expect(currentUser(testUsers)).toBeNull();
  });
});
