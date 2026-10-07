import React from 'react';
import { Button, Card, Field, Input } from '../../design-system';
import type { InputProps } from '../../design-system';
import { useAuth } from '../AuthGate';
import type { SignInRefusal } from '../AuthGate';

/** Input forwards unknown props to the <input>; its typings just do not list them. */
const inputAttrs = (attrs: Record<string, string>) => attrs as unknown as InputProps;

/** What the password field says when a sign-in is turned away. */
const REFUSALS: Record<SignInRefusal, string> = {
  mismatch: 'That username and password don’t match.',
  'no-staff': 'This sign-in isn’t linked to anyone on the staff list. Ask the office to add you.',
  archived:
    'This sign-in belongs to someone who is no longer on the staff. Ask an admin if that is wrong.',
};

export default function Login() {
  const { signIn, refusal } = useAuth();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<SignInRefusal | null>(refusal);
  const formRef = React.useRef<HTMLFormElement>(null);

  // Input does not forward refs, so reach the field through the form.
  const focusField = (id: string) =>
    formRef.current?.querySelector<HTMLInputElement>('#' + id)?.focus();

  React.useEffect(() => {
    focusField('login-username');
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailed(null);
    const refused = await signIn(username, password);
    // On success this screen unmounts, so only touch state on a miss.
    if (refused) {
      setBusy(false);
      setFailed(refused);
      setPassword('');
      focusField('login-password');
    }
  }

  return (
    <div className="ja-login">
      <div className="ja-login__inner">
        <img className="ja-login__logo" src="/assets/jazz-angels-logo.png" alt="Jazz Angels" />
        <Card padding="0">
          <div className="ja-login__head">
            <h1>Sign in</h1>
            <p>Jazz Angels staff portal</p>
          </div>
          <form ref={formRef} className="ja-login__form" onSubmit={onSubmit} noValidate>
            <Field label="Username" htmlFor="login-username">
              <Input
                {...inputAttrs({
                  id: 'login-username',
                  name: 'username',
                  autoComplete: 'username',
                  autoCapitalize: 'none',
                  spellCheck: 'false',
                })}
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            </Field>
            <Field
              label="Password"
              htmlFor="login-password"
              error={failed ? REFUSALS[failed] : undefined}
            >
              <Input
                type="password"
                invalid={!!failed}
                {...inputAttrs({
                  id: 'login-password',
                  name: 'password',
                  autoComplete: 'current-password',
                })}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                }}
              />
            </Field>
            <Button {...({ type: 'submit' } as object)} fullWidth disabled={busy}>
              {busy ? 'Signing in' : 'Sign in'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
