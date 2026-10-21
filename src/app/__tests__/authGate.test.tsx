// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Arrival, AuthClient } from '../../core';
import { AuthProvider, CHOOSING_KEY, useAuth } from '../AuthGate';
import ChoosePassword from '../screens/ChoosePassword';
import Login from '../screens/Login';

/**
 * The sign-in gate (#160): on Supabase (a stubbed client) it signs in with an email, restores a
 * session, asks an invitation's or a reset's link for a password, refuses an archived person or
 * an account with no login, and goes back to sign-in when the session ends by itself. Without a
 * client it is the demo's username sign-in, as before.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = (event: string, session: unknown) => void;

const session = { user: { email: 'devon@example.org' }, access_token: 't' };

function stub({
  signedIn = false,
  who = [{ staff_id: 's-devon', archived: false }] as unknown[],
} = {}) {
  let current: unknown = signedIn ? session : null;
  const listeners: Listener[] = [];
  const fire = (event: string) => listeners.forEach(l => l(event, current));
  const rows = { who };
  const client = {
    rpc: vi.fn(async () => ({ data: rows.who, error: null })),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: current } })),
      onAuthStateChange: vi.fn((l: Listener) => {
        listeners.push(l);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      }),
      signInWithPassword: vi.fn(async ({ password }: { password: string }) => {
        if (password !== 'right') {
          return { data: {}, error: { code: 'invalid_credentials', status: 400 } };
        }
        current = session;
        return { data: { session }, error: null };
      }),
      signOut: vi.fn(async () => {
        current = null;
        fire('SIGNED_OUT');
        return { error: null };
      }),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
    },
  };
  return { client: client as unknown as AuthClient, raw: client, fire, rows };
}

function Probe() {
  const { ready, user, choosing, signOut } = useAuth();
  if (!ready) return <p>Checking</p>;
  if (choosing) return <ChoosePassword />;
  if (!user) return <Login />;
  return (
    <p>
      Signed in as {user.staffId} <button onClick={() => signOut()}>Leave</button>
    </p>
  );
}

let root: Root;
let host: HTMLDivElement;

/** Let the deferred auth callbacks and their promises run. */
const settle = () => act(() => new Promise(r => setTimeout(r, 0)));

async function render(client: AuthClient | null, arrival: Arrival = null) {
  await act(async () =>
    root.render(
      <AuthProvider client={client} arrival={arrival}>
        <Probe />
      </AuthProvider>,
    ),
  );
  await settle();
}

const text = () => host.textContent ?? '';
const button = (name: string) =>
  [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === name)!;
const labels = () => [...host.querySelectorAll('label')].map(l => l.textContent?.trim());

async function type(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>('#' + id)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(name: string) {
  await act(async () => button(name).click());
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('the demo, with no Supabase client', () => {
  it('asks for a username, as before, with no reset', async () => {
    await render(null);
    expect(labels()).toEqual(['Username', 'Password']);
    expect(button('Forgot your password?')).toBeUndefined();
  });
});

describe('on Supabase', () => {
  it('asks for an email, and signs in as the staff record behind the login', async () => {
    const { client } = stub();
    await render(client);
    expect(labels()).toEqual(['Email', 'Password']);
    await type('login-username', 'devon@example.org');
    await type('login-password', 'wrong');
    await click('Sign in');
    expect(text()).toContain('That email and password don’t match.');
    await type('login-password', 'right');
    await click('Sign in');
    expect(text()).toContain('Signed in as s-devon');
  });

  it('refuses an archived person and an account with no login, with the same sentences', async () => {
    const { client, raw, rows } = stub();
    rows.who = [{ staff_id: 's-devon', archived: true }];
    await render(client);
    await type('login-username', 'devon@example.org');
    await type('login-password', 'right');
    await click('Sign in');
    expect(text()).toContain('This sign-in belongs to someone who is no longer on the staff.');
    expect(raw.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });

    rows.who = [];
    await type('login-password', 'right');
    await click('Sign in');
    expect(text()).toContain('This sign-in isn’t linked to anyone on the staff list.');
  });

  it('restores a saved session, and an archived person’s is turned away', async () => {
    await render(stub({ signedIn: true }).client);
    expect(text()).toContain('Signed in as s-devon');

    act(() => root.unmount());
    root = createRoot(host);
    const gone = stub({ signedIn: true, who: [{ staff_id: 's-devon', archived: true }] });
    await render(gone.client);
    expect(text()).toContain('no longer on the staff');
    expect(gone.raw.auth.signOut).toHaveBeenCalled();
  });

  it('signing out ends the session and shows sign-in with nothing to say', async () => {
    const { client, raw } = stub({ signedIn: true });
    await render(client);
    await click('Leave');
    expect(raw.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(labels()).toEqual(['Email', 'Password']);
    expect(host.querySelector('.ja-login__note')).toBeNull();
  });

  it('a session that ends by itself goes back to sign-in and says so', async () => {
    const { client, fire } = stub({ signedIn: true });
    await render(client);
    await act(async () => fire('SIGNED_OUT'));
    await settle();
    expect(host.querySelector('.ja-login__note')?.textContent).toBe(
      'You were signed out because your session ended. Sign in again to carry on.',
    );
  });

  it('a refreshed session is checked again: archiving shuts them out', async () => {
    const { client, fire, rows } = stub({ signedIn: true });
    await render(client);
    rows.who = [{ staff_id: 's-devon', archived: true }];
    await act(async () => fire('TOKEN_REFRESHED'));
    await settle();
    expect(text()).toContain('no longer on the staff');
  });

  it('an invitation’s link asks for a password first, and again after a reload', async () => {
    const { client, raw } = stub({ signedIn: true });
    await render(client, { kind: 'invite' });
    expect(host.querySelector('h1')?.textContent).toBe('Choose a password');
    expect(text()).toContain('devon@example.org');

    // A reload: the link is gone from the address, the tab still remembers.
    act(() => root.unmount());
    root = createRoot(host);
    await render(client);
    expect(host.querySelector('h1')?.textContent).toBe('Choose a password');

    await type('choose-password', 'chosen-41');
    await type('choose-again', 'chosen-42');
    await click('Save password');
    expect(text()).toContain('The two passwords don’t match.');
    await type('choose-again', 'chosen-41');
    await click('Save password');
    expect(raw.auth.updateUser).toHaveBeenCalledWith({ password: 'chosen-41' });
    expect(text()).toContain('Signed in as s-devon');
    expect(sessionStorage.getItem(CHOOSING_KEY)).toBeNull();
  });

  it('a reset’s link asks for a new password', async () => {
    await render(stub({ signedIn: true }).client, { kind: 'recovery' });
    expect(host.querySelector('h1')?.textContent).toBe('Choose a new password');
  });

  it('a link that failed says so on the sign-in screen', async () => {
    await render(stub().client, { kind: 'link-failed' });
    expect(host.querySelector('.ja-login__note')?.textContent).toMatch(
      /^That link has been used already or has run out\./,
    );
  });

  it('Forgot your password? sends the reset email', async () => {
    const { client, raw } = stub();
    await render(client);
    await type('login-username', 'devon@example.org');
    await click('Forgot your password?');
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Reset your password');
    expect(host.querySelector<HTMLInputElement>('#reset-email')!.value).toBe('devon@example.org');
    await click('Send link');
    expect(raw.auth.resetPasswordForEmail).toHaveBeenCalledWith('devon@example.org', {
      redirectTo: `${window.location.origin}/`,
    });
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain(
      'If devon@example.org has a sign-in, a link to choose a new password is on its way.',
    );
  });
});
