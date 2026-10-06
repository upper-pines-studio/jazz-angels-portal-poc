import React from 'react';
import { Badge, Button, Card, Dialog, Icon } from '../../../../design-system';
import { useStore } from '../../../../core';
import { className, grantById, syncedLabel } from '../../domain';
import { KV } from '../../../../app/components/badges';
import { useToast } from '../../../../app/ToastHost';
import { LinkButton } from '../money/shared';
import './settings-cards.css';

/** Settings: the read-only link to QuickBooks Online. */
export function QuickBooksCard() {
  const { state, today, actions } = useStore();
  const toast = useToast();
  const qb = state.grants.quickbooks;
  const [showAccounts, setShowAccounts] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);

  const received = state.grants.transactions.length;
  const waiting = state.grants.incoming.length;
  const toAssign = state.grants.transactions.filter(t => t.status === 'to-assign').length;
  const accounts = state.grants.accounts;
  const classes = state.grants.classes;
  const synced = syncedLabel(state, today);

  const sync = () => {
    const n = actions.grants.syncQuickBooks();
    toast({
      tone: n ? 'success' : 'info',
      title: n
        ? `${n} new ${n === 1 ? 'transaction' : 'transactions'} from QuickBooks`
        : 'Nothing new in QuickBooks',
      message: n
        ? 'They are waiting on Transactions to be assigned to a budget line.'
        : 'Every transaction QuickBooks has is already here.',
    });
  };

  const disconnect = () => {
    actions.grants.setQuickBooksConnected(false);
    setConfirming(false);
    setShowAccounts(false);
    toast({
      tone: 'info',
      title: 'QuickBooks disconnected',
      message:
        'Expenses already assigned stay on their grants. Nothing new arrives until you reconnect.',
    });
  };

  /** "Teaching artist stipends: Herb Alpert GOS, LA County OGP". */
  const usedBy = (code: string): string => {
    const lines = state.grants.budgetLines.filter(
      l => l.accountCodes?.includes(code) && grantById(state, l.grantId),
    );
    if (!lines.length) return 'No budget line uses it yet';
    const byCategory = new Map<string, string[]>();
    for (const l of lines) {
      const where = className(state, l.classId) ?? grantById(state, l.grantId)?.title ?? 'a grant';
      byCategory.set(l.category, [...(byCategory.get(l.category) ?? []), where]);
    }
    return [...byCategory.entries()]
      .map(([cat, where]) => `${cat}: ${where.join(', ')}`)
      .join('; ');
  };

  return (
    <>
      <Card
        title="QuickBooks Online"
        subtitle="Where expenses come from. Read-only: the portal never writes back."
        action={
          qb.connected ? (
            <Badge tone="teal" dot>
              Connected
            </Badge>
          ) : (
            <Badge tone="neutral">Not connected</Badge>
          )
        }
      >
        {qb.connected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <KV k="Company" v={qb.company} strong />
              <KV k="Last sync" v={`Synced ${synced}`} />
              <KV
                k="Transactions"
                v={
                  <>
                    {received} received ·{' '}
                    {waiting ? `${waiting} waiting in QuickBooks` : 'none waiting'}
                    {toAssign ? ` · ${toAssign} to assign` : ''}
                  </>
                }
              />
              <KV
                k="Chart of accounts"
                v={
                  <span
                    style={{
                      display: 'inline-flex',
                      gap: 'var(--space-3)',
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                    }}
                  >
                    {accounts.length} expense accounts · {classes.length} classes
                    <LinkButton onClick={() => setShowAccounts(s => !s)}>
                      {showAccounts ? 'Hide accounts' : 'Show accounts'}
                    </LinkButton>
                  </span>
                }
              />
            </div>

            {showAccounts && (
              <div className="ja-qb-accounts">
                <div className="ja-qb-accounts__head">Accounts</div>
                {accounts.map(a => (
                  <div key={a.code} className="ja-qb-accounts__row">
                    <span className="ja-qb-accounts__code">{a.code}</span>
                    <span className="ja-qb-accounts__name">{a.name}</span>
                    <span className="ja-qb-accounts__used">{usedBy(a.code)}</span>
                  </div>
                ))}
                <div className="ja-qb-accounts__head">Classes</div>
                {classes.map(c => {
                  const grants = [
                    ...new Set(
                      state.grants.budgetLines
                        .filter(l => l.classId === c.id)
                        .map(l => grantById(state, l.grantId)?.title)
                        .filter(Boolean),
                    ),
                  ];
                  return (
                    <div key={c.id} className="ja-qb-accounts__row">
                      <span className="ja-qb-accounts__code">
                        <Icon name="tag" size={12} />
                      </span>
                      <span className="ja-qb-accounts__name">{c.name}</span>
                      <span className="ja-qb-accounts__used">
                        {grants.length ? grants.join(', ') : 'No grant uses it yet'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {confirming ? (
              <div className="ja-qb-confirm" role="alert">
                <p style={{ margin: 0 }}>
                  <strong>Disconnect QuickBooks?</strong> Expenses already assigned stay on their
                  grants. Nothing new arrives until it is reconnected.
                </p>
                <span style={{ display: 'inline-flex', gap: 'var(--space-2)', flex: '0 0 auto' }}>
                  <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
                    Keep connected
                  </Button>
                  <Button variant="danger" size="sm" onClick={disconnect}>
                    Disconnect
                  </Button>
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Icon name="refresh-cw" size={14} />}
                  onClick={sync}
                >
                  Sync now
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                  Disconnect
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-5)',
              flexWrap: 'wrap',
            }}
          >
            <p
              style={{
                margin: 0,
                flex: '1 1 280px',
                font: 'var(--type-body-sm)',
                color: 'var(--text-body)',
              }}
            >
              Connect QuickBooks Online and new expenses arrive here each morning, ready to assign
              to a budget line, so nobody types them twice.
              {received > 0 && ` The ${received} transactions already here stay.`}
            </p>
            <Button variant="primary" size="sm" onClick={() => setConnecting(true)}>
              Connect QuickBooks
            </Button>
          </div>
        )}
      </Card>

      {connecting && (
        <Dialog
          open
          title="Connect QuickBooks Online"
          width={480}
          onClose={() => setConnecting(false)}
          description="This stands in for the Intuit sign-in. It is a demo: no QuickBooks account is contacted."
          footer={
            <>
              <Button variant="secondary" onClick={() => setConnecting(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  actions.grants.setQuickBooksConnected(true);
                  const n = actions.grants.syncQuickBooks();
                  setConnecting(false);
                  toast({
                    tone: 'success',
                    title: 'QuickBooks connected',
                    message: n
                      ? `${n} new ${n === 1 ? 'transaction' : 'transactions'} came in and wait on Transactions.`
                      : 'Synced. Nothing new was waiting.',
                  });
                }}
              >
                Connect
              </Button>
            </>
          }
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              font: 'var(--type-body-sm)',
              color: 'var(--text-body)',
            }}
          >
            <KV k="Company" v={qb.company} strong />
            <p style={{ margin: 0 }}>The portal will be allowed to read:</p>
            <ul
              style={{
                margin: 0,
                paddingLeft: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <li>Expense transactions: date, payee, memo, account, class and amount</li>
              <li>The chart of accounts and the classes</li>
            </ul>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              QuickBooks is read-only here. The portal never changes anything in it.
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
}
