import { describe, expect, it } from 'vitest';
import { mayInvite } from '../invitations';
import type { SignIn } from '../invitations';
import { browserKeyProblem, supabaseFromEnv } from '../supabase';
import type { Role, StaffMember } from '../types';

const person = (role: Role, extra: Partial<StaffMember> = {}): StaffMember => ({
  id: 's-x',
  name: 'Dana Whitfield',
  title: 'Staff',
  role,
  teaches: false,
  email: 'dana@example.org',
  ...extra,
});

const signIn: SignIn = {
  staffId: 's-x',
  invitedBy: 's-gwen',
  invitedAt: '2026-10-20T17:00:00Z',
  acceptedAt: null,
};

describe('who may send an invitation (decision 0001)', () => {
  it('an Admin or a Director, for a current record with an email and no sign-in', () => {
    expect(mayInvite('admin', person('teacher'), undefined)).toBe(true);
    expect(mayInvite('director', person('bookkeeper'), undefined)).toBe(true);
  });

  it('nobody else', () => {
    for (const role of [
      'office-manager',
      'bookkeeper',
      'teacher',
      'assistant',
      'read-only',
    ] as const) {
      expect(mayInvite(role, person('teacher'), undefined)).toBe(false);
    }
  });

  it('not for an archived record, one with no email, or one with a sign-in', () => {
    expect(mayInvite('admin', person('teacher', { archivedAt: '2026-10-01' }), undefined)).toBe(
      false,
    );
    expect(mayInvite('admin', person('teacher', { email: undefined }), undefined)).toBe(false);
    expect(mayInvite('admin', person('teacher'), signIn)).toBe(false);
  });

  it("only an Admin for an Admin's record", () => {
    expect(mayInvite('director', person('admin'), undefined)).toBe(false);
    expect(mayInvite('admin', person('admin'), undefined)).toBe(true);
  });
});

describe('the portal on Supabase (decision 0009)', () => {
  const url = 'http://127.0.0.1:54321';
  const key = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

  it('needs the address and the publishable key, with the demo off', () => {
    expect(supabaseFromEnv(url, key, false)).toEqual({ url, key });
    expect(supabaseFromEnv(url, key, true)).toBeNull();
    expect(supabaseFromEnv(undefined, key, false)).toBeNull();
    expect(supabaseFromEnv(url, ' ', false)).toBeNull();
  });

  it('refuses a secret key, new or legacy, so it never reaches the browser', () => {
    const jwt = (role: string) =>
      `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.signature`;
    expect(browserKeyProblem('sb_secret_N7UND0UgjKTVK')).toBe('a secret key');
    expect(browserKeyProblem(jwt('service_role'))).toBe('the service role key');
    expect(browserKeyProblem(jwt('anon'))).toBeNull();
    expect(browserKeyProblem(key)).toBeNull();
    expect(supabaseFromEnv(url, 'sb_secret_N7UND0UgjKTVK', false)).toBeNull();
    expect(supabaseFromEnv(url, jwt('service_role'), false)).toBeNull();
  });
});
