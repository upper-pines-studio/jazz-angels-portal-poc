import React from 'react';
import { Button, Field, Input } from '../../design-system';
import { useAuth } from '../AuthGate';
import { LoginFrame, inputAttrs } from './Login';

/**
 * Where an invitation's link (#157) or a reset's link lands, on Supabase (#160): the person is
 * signed in by the link and chooses their password before anything else shows. Saving it takes
 * them in.
 */
export default function ChoosePassword() {
  const { choosing, choosePassword, signOut } = useAuth();
  const [password, setPassword] = React.useState('');
  const [again, setAgain] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const focusField = (id: string) =>
    formRef.current?.querySelector<HTMLInputElement>('#' + id)?.focus();

  React.useEffect(() => {
    focusField('choose-password');
  }, []);

  if (!choosing) return null;
  const first = choosing.kind === 'invite';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const refused = await choosePassword(password, again);
    // Saved: this screen unmounts.
    if (refused) {
      setBusy(false);
      setProblem(refused);
      setAgain('');
      focusField(password ? 'choose-again' : 'choose-password');
    }
  }

  return (
    <LoginFrame
      title={first ? 'Choose a password' : 'Choose a new password'}
      subtitle={
        first
          ? `Welcome to the Jazz Angels staff portal. You’ll sign in as ${choosing.email} with this password from now on.`
          : `For ${choosing.email}. Your old password stops working once you save this one.`
      }
    >
      <form ref={formRef} className="ja-login__form" onSubmit={onSubmit} noValidate>
        {/* For the browser's password manager: the account this password belongs to. */}
        <input
          type="email"
          name="email"
          autoComplete="username"
          value={choosing.email}
          readOnly
          hidden
        />
        <Field label="Password" htmlFor="choose-password">
          <Input
            type="password"
            {...inputAttrs({
              id: 'choose-password',
              name: 'password',
              autoComplete: 'new-password',
            })}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Password again" htmlFor="choose-again" error={problem ?? undefined}>
          <Input
            type="password"
            invalid={!!problem}
            {...inputAttrs({ id: 'choose-again', name: 'again', autoComplete: 'new-password' })}
            value={again}
            onChange={e => setAgain(e.target.value)}
          />
        </Field>
        <Button {...({ type: 'submit' } as object)} fullWidth disabled={busy}>
          {busy ? 'Saving' : 'Save password'}
        </Button>
        <Button {...({ type: 'button' } as object)} variant="link" onClick={() => signOut()}>
          Sign out
        </Button>
      </form>
    </LoginFrame>
  );
}
