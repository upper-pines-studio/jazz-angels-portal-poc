import React from 'react';
import { Button, Card, Field, Input } from '../../design-system';
import type { InputProps } from '../../design-system';
import { AppDialog } from '../components/AppDialog';
import { useAuth } from '../AuthGate';
import type { SignInRefusal } from '../AuthGate';

/** Input forwards unknown props to the <input>; its typings just do not list them. */
export const inputAttrs = (attrs: Record<string, string>) => attrs as unknown as InputProps;

/** What the password field says when a sign-in is turned away. */
const REFUSALS: Record<Exclude<SignInRefusal, 'expired' | 'link-failed'>, string> = {
  mismatch: 'That username and password don’t match.',
  'no-staff': 'This sign-in isn’t linked to anyone on the staff list. Ask the office to add you.',
  archived:
    'This sign-in belongs to someone who is no longer on the staff. Ask an admin if that is wrong.',
  unreachable:
    'The portal couldn’t reach its sign-in service. Check your connection and try again.',
};

/** What the screen says above the form when a session ended or a link did not work. */
const NOTES: Record<'expired' | 'link-failed', string> = {
  expired: 'You were signed out because your session ended. Sign in again to carry on.',
  'link-failed':
    'That link has been used already or has run out. Use Forgot your password for a new one, or ask an admin to send the invitation again.',
};

function isNote(r: SignInRefusal | null): r is 'expired' | 'link-failed' {
  return r === 'expired' || r === 'link-failed';
}

/** The sign-in screen's frame: the logo and a card with a heading. Choose password uses it too. */
export function LoginFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="ja-login">
      <div className="ja-login__inner">
        <img className="ja-login__logo" src="/assets/jazz-angels-logo.png" alt="Jazz Angels" />
        <Card padding="0">
          <div className="ja-login__head">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {children}
        </Card>
      </div>
    </div>
  );
}

export default function Login() {
  const { signIn, refusal, mode, sendReset } = useAuth();
  const byEmail = mode === 'supabase';
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<SignInRefusal | null>(
    isNote(refusal) ? null : refusal,
  );
  const [note, setNote] = React.useState<SignInRefusal | null>(isNote(refusal) ? refusal : null);
  const [resetOpen, setResetOpen] = React.useState(false);
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
    setNote(null);
    const refused = await signIn(username, password);
    // On success this screen unmounts, so only touch state on a miss.
    if (refused) {
      setBusy(false);
      if (isNote(refused)) setNote(refused);
      else setFailed(refused);
      setPassword('');
      focusField('login-password');
    }
  }

  const error =
    failed && !isNote(failed)
      ? failed === 'mismatch' && byEmail
        ? 'That email and password don’t match.'
        : REFUSALS[failed]
      : undefined;

  return (
    <LoginFrame title="Sign in" subtitle="Jazz Angels staff portal">
      <form ref={formRef} className="ja-login__form" onSubmit={onSubmit} noValidate>
        {isNote(note) && (
          <p className="ja-login__note" role="status">
            {NOTES[note]}
          </p>
        )}
        <Field label={byEmail ? 'Email' : 'Username'} htmlFor="login-username">
          <Input
            type={byEmail ? 'email' : 'text'}
            {...inputAttrs({
              id: 'login-username',
              name: byEmail ? 'email' : 'username',
              autoComplete: byEmail ? 'email' : 'username',
              autoCapitalize: 'none',
              spellCheck: 'false',
            })}
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="login-password" error={error}>
          <Input
            type="password"
            invalid={!!error}
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
        {byEmail && (
          <Button
            {...({ type: 'button' } as object)}
            variant="link"
            onClick={() => setResetOpen(true)}
          >
            Forgot your password?
          </Button>
        )}
      </form>
      {resetOpen && (
        <ResetDialog
          initialEmail={username}
          send={sendReset}
          onClose={() => {
            setResetOpen(false);
            focusField('login-username');
          }}
        />
      )}
    </LoginFrame>
  );
}

/** "Forgot your password?": sends Supabase's reset email to the address given. */
function ResetDialog({
  initialEmail,
  send,
  onClose,
}: {
  initialEmail: string;
  send: (email: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [email, setEmail] = React.useState(initialEmail.trim());
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  async function onSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const refused = await send(email);
    setBusy(false);
    if (refused) setProblem(refused);
    else setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <AppDialog
        title="Check your email"
        description={`If ${sentTo} has a sign-in, a link to choose a new password is on its way. It works once, for the next hour.`}
        onClose={onClose}
        footer={
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        }
      />
    );
  }

  return (
    <AppDialog
      title="Reset your password"
      description="We’ll email you a link to choose a new password."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void onSend()} disabled={busy}>
            {busy ? 'Sending' : 'Send link'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSend} noValidate>
        <Field label="Email" htmlFor="reset-email" error={problem ?? undefined}>
          <Input
            type="email"
            invalid={!!problem}
            {...inputAttrs({
              id: 'reset-email',
              name: 'email',
              autoComplete: 'email',
              autoCapitalize: 'none',
              spellCheck: 'false',
            })}
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </Field>
      </form>
    </AppDialog>
  );
}
