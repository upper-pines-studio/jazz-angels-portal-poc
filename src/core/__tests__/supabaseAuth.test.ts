import { describe, expect, it, vi } from 'vitest';
import {
  arrivalFrom,
  choosePassword,
  sendPasswordReset,
  signInWithEmail,
  whoSignedIn,
} from '../supabaseAuth';
import type { AuthClient } from '../supabaseAuth';

/**
 * Sign-in through Supabase (#160) with a stubbed client: the refusals and the sentences. The
 * same functions run against the local Supabase in db/sign-in.test.ts.
 */

interface Stub {
  who?: { data: unknown; error: unknown };
  signIn?: { data: unknown; error: unknown } | Error;
  reset?: { error: unknown };
  update?: { error: unknown };
}

function stub(s: Stub) {
  const signOut = vi.fn(async () => ({ error: null }));
  const client = {
    rpc: vi.fn(async () => s.who ?? { data: [], error: null }),
    auth: {
      signInWithPassword: vi.fn(async () => {
        if (s.signIn instanceof Error) throw s.signIn;
        return s.signIn ?? { data: { session: null }, error: null };
      }),
      signOut,
      resetPasswordForEmail: vi.fn(async () => s.reset ?? { error: null }),
      updateUser: vi.fn(async () => s.update ?? { error: null }),
    },
  } as unknown as AuthClient;
  return { client, signOut };
}

const session = { user: { email: 'devon@example.org' } };
const signedIn = { data: { session }, error: null };

describe('arrivalFrom', () => {
  it('reads an invitation, a reset and a failed link from the address', () => {
    expect(arrivalFrom('#access_token=a&refresh_token=b&type=invite')).toEqual({ kind: 'invite' });
    expect(arrivalFrom('#access_token=a&type=recovery')).toEqual({ kind: 'recovery' });
    expect(
      arrivalFrom('#error=access_denied&error_code=otp_expired&error_description=Email+link'),
    ).toEqual({ kind: 'link-failed' });
    expect(arrivalFrom('', '?error_code=otp_expired')).toEqual({ kind: 'link-failed' });
  });

  it('is null for anything else', () => {
    expect(arrivalFrom('')).toBeNull();
    expect(arrivalFrom('#type=invite')).toBeNull();
    expect(arrivalFrom('#access_token=a&type=magiclink')).toBeNull();
  });
});

describe('whoSignedIn', () => {
  it('is the staff record, or why not', async () => {
    const as = (data: unknown, error: unknown = null) =>
      whoSignedIn(stub({ who: { data, error } }).client);
    expect(await as([{ staff_id: 's-devon', archived: false }])).toEqual({ staffId: 's-devon' });
    expect(await as([{ staff_id: 's-devon', archived: true }])).toEqual({ refusal: 'archived' });
    expect(await as([])).toEqual({ refusal: 'no-staff' });
    expect(await as(null, { message: 'down' })).toEqual({ refusal: 'unreachable' });
  });
});

describe('signInWithEmail', () => {
  it('signs in as the staff record behind the login', async () => {
    const { client, signOut } = stub({
      signIn: signedIn,
      who: { data: [{ staff_id: 's-devon', archived: false }], error: null },
    });
    expect(await signInWithEmail(client, ' devon@example.org ', 'pw')).toEqual({
      ok: true,
      staffId: 's-devon',
      email: 'devon@example.org',
    });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'devon@example.org',
      password: 'pw',
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('a wrong password is a mismatch; an empty field never asks', async () => {
    const wrong = stub({
      signIn: { data: {}, error: { code: 'invalid_credentials', status: 400 } },
    });
    expect(await signInWithEmail(wrong.client, 'a@b.org', 'x')).toEqual({
      ok: false,
      reason: 'mismatch',
    });
    const empty = stub({});
    expect(await signInWithEmail(empty.client, '', 'x')).toEqual({ ok: false, reason: 'mismatch' });
    expect(empty.client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('no answer from Supabase is unreachable', async () => {
    expect(
      await signInWithEmail(stub({ signIn: new Error('fetch failed') }).client, 'a@b.org', 'x'),
    ).toEqual({ ok: false, reason: 'unreachable' });
    expect(
      await signInWithEmail(
        stub({ signIn: { data: {}, error: { status: 0, code: undefined } } }).client,
        'a@b.org',
        'x',
      ),
    ).toEqual({ ok: false, reason: 'unreachable' });
  });

  it.each([
    [[{ staff_id: 's-old', archived: true }], 'archived'],
    [[], 'no-staff'],
  ] as const)('refuses %j as %s and signs straight out', async (rows, reason) => {
    const { client, signOut } = stub({ signIn: signedIn, who: { data: rows, error: null } });
    expect(await signInWithEmail(client, 'a@b.org', 'x')).toEqual({ ok: false, reason });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('sendPasswordReset', () => {
  it('sends to the address with the link back to the portal', async () => {
    const { client } = stub({});
    expect(await sendPasswordReset(client, ' a@b.org ', 'http://localhost:5181/')).toBeNull();
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.org', {
      redirectTo: 'http://localhost:5181/',
    });
  });

  it('says what went wrong in a sentence', async () => {
    const said = (error: unknown) =>
      sendPasswordReset(stub({ reset: { error } }).client, 'a@b.org', '/');
    expect(await sendPasswordReset(stub({}).client, ' ', '/')).toBe(
      'Enter the email you sign in with.',
    );
    expect(await said({ status: 429, code: 'over_email_send_rate_limit' })).toBe(
      'A link was sent a moment ago. Wait a minute, then ask again.',
    );
    expect(await said({ status: 400, code: 'validation_failed' })).toBe(
      'That doesn’t look like an email address.',
    );
    expect(await said({ status: 500 })).toBe(
      'The email could not be sent. Check your connection and try again.',
    );
  });
});

describe('choosePassword', () => {
  it('saves a password typed the same twice', async () => {
    const { client } = stub({});
    expect(await choosePassword(client, 'chosen-1', 'chosen-1')).toBeNull();
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'chosen-1' });
  });

  it('checks the two match before asking', async () => {
    const { client } = stub({});
    expect(await choosePassword(client, '', '')).toBe('Choose a password.');
    expect(await choosePassword(client, 'a1', 'a2')).toBe('The two passwords don’t match.');
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("keeps Supabase's own sentence for a weak password, and says the rest plainly", async () => {
    const said = (error: unknown) => choosePassword(stub({ update: { error } }).client, 'p', 'p');
    expect(
      await said({ code: 'weak_password', message: 'Password should be at least 6 characters.' }),
    ).toBe('Password should be at least 6 characters.');
    expect(await said({ code: 'same_password' })).toBe(
      'That is the password you have now. Choose a new one.',
    );
    expect(await said({ code: 'session_not_found', status: 403 })).toMatch(/The link has run out/);
    expect(await said({ status: 500 })).toBe(
      'Your password was not saved. Check your connection and try again.',
    );
  });
});
