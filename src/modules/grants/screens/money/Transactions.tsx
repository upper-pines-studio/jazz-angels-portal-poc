import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Input,
  Select,
  Tabs,
  Tag,
} from '../../../../design-system';
import { money, useCan, useStore } from '../../../../core';
import { usePageHeader } from '../../../../app/Shell';
import { useToast } from '../../../../app/ToastHost';
import { WithPanel } from '../../../../app/components/SidePanel';
import {
  acceptableSuggestions,
  accountLabel,
  grantById,
  lineById,
  splitByPercent,
  syncedLabel,
  transactionById,
  transactionCounts,
  transactionsByStatus,
} from '../../domain';
import type { Allocation, Expense, Suggestion, Transaction, TransactionStatus } from '../../domain';
import { SplitPanel } from './SplitPanel';
import { TransactionRow } from './TransactionRow';
import type { DraftSummary, RowHandlers } from './TransactionRow';
import {
  PERIODS,
  defaultPeriod,
  grantFunder,
  isPeriod,
  joinWords,
  periodRange,
  restore,
  snapshot,
} from './transactionHelpers';
import type { Snapshot } from './transactionHelpers';
import './transactions.css';

type Tab = TransactionStatus | 'all';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'to-assign', label: 'To assign' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'not-grant-funded', label: 'Not grant-funded' },
  { id: 'all', label: 'All' },
];

const PAGE_SIZE = 25;

const EMPTY_TAB: Record<Tab, { title: string; message: string }> = {
  'to-assign': { title: 'Everything from QuickBooks has a home', message: '' },
  assigned: {
    title: 'Nothing assigned yet',
    message: 'Transactions land here once they are on a budget line. Start on the To assign tab.',
  },
  'not-grant-funded': {
    title: 'Nothing set aside yet',
    message:
      'Overhead that no grant pays for, like software and bank fees, lands here when you mark it Not grant-funded.',
  },
  all: {
    title: 'No transactions yet',
    message: 'Spending from QuickBooks shows up here after a sync.',
  },
};

/** "Undo" inside a toast. It works once, then says so. */
function UndoButton({ onUndo }: { onUndo: () => void }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      className="tx-undo"
      disabled={done}
      onClick={() => {
        setDone(true);
        onUndo();
      }}
    >
      {done ? 'Undone' : 'Undo'}
    </button>
  );
}

/**
 * Transactions: what QuickBooks sent, and where each one belongs. The
 * bookkeeper works the To assign tab down to nothing each week; a split opens
 * in the panel on the right.
 */
export default function Transactions() {
  const { state, today, actions } = useStore();
  const allowed = useCan();
  const mayAssign = allowed('transactions', 'edit');
  const maySync = allowed('quickbooks-sync');
  const mayConnect = allowed('quickbooks-connect');
  const toast = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const qb = state.grants.quickbooks;

  const [syncing, setSyncing] = React.useState(false);
  const [changing, setChanging] = React.useState<Set<string>>(() => new Set());
  const [draft, setDraft] = React.useState<DraftSummary | undefined>();
  const timer = React.useRef<number | undefined>();
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  // --- What the URL asks for -------------------------------------------------
  const tabParam = params.get('tab');
  const tab: Tab = TABS.some(t => t.id === tabParam) ? (tabParam as Tab) : 'to-assign';
  const q = params.get('q') ?? '';
  const account = params.get('account') ?? 'all';
  const periodParam = params.get('period');
  const period = isPeriod(periodParam)
    ? periodParam
    : tab === 'to-assign'
      ? defaultPeriod(state, today)
      : 'all';
  const grantFilter = params.get('grant') ?? undefined;
  const lineFilter = params.get('line') ?? undefined;
  // The split panel is for assigning, so a View role never opens it.
  const panelTx = mayAssign ? transactionById(state, params.get('tx') ?? undefined) : undefined;

  /** Change the URL in place. Any filter change goes back to the first page. */
  const patch = React.useCallback(
    (changes: Record<string, string | undefined>) => {
      setParams(
        prev => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === undefined || v === '') next.delete(k);
            else next.set(k, v);
          }
          if (!('page' in changes) && !('tx' in changes)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // --- Header ----------------------------------------------------------------
  const sync = () => {
    if (syncing || !qb.connected || !maySync) return;
    setSyncing(true);
    timer.current = window.setTimeout(() => {
      const n = actions.grants.syncQuickBooks();
      setSyncing(false);
      if (n > 0) {
        toast({
          title: `${n} new ${n === 1 ? 'transaction' : 'transactions'} from QuickBooks`,
          message: 'They are waiting on the To assign tab.',
        });
      } else {
        toast({
          tone: 'info',
          title: 'Nothing new in QuickBooks',
          message: 'Everything QuickBooks has is already here.',
        });
      }
    }, 900);
  };

  usePageHeader({
    title: 'Transactions',
    subtitle: qb.connected
      ? `QuickBooks Online is connected · Last synced ${syncedLabel(state, today)} · Read only, nothing is written back`
      : `QuickBooks is not connected · Last synced ${syncedLabel(state, today)} · Nothing new arrives until it is connected again`,
    actions: maySync ? (
      <Button
        variant="secondary"
        size="sm"
        iconLeft={<Icon name="refresh-cw" size={15} />}
        disabled={!qb.connected || syncing}
        onClick={sync}
      >
        {syncing ? 'Syncing' : 'Sync now'}
      </Button>
    ) : undefined,
  });

  // --- Rows ------------------------------------------------------------------
  const partsByTx = React.useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of state.grants.expenses) {
      if (!e.transactionId) continue;
      const list = map.get(e.transactionId) ?? [];
      list.push(e);
      map.set(e.transactionId, list);
    }
    return map;
  }, [state.grants.expenses]);

  const counts = transactionCounts(state);
  const inTab = transactionsByStatus(state, tab);
  const { from, to } = periodRange(state, period, today);
  const needle = q.trim().toLowerCase();
  const rows = inTab.filter(t => {
    if (needle && !t.payee.toLowerCase().includes(needle) && !t.memo.toLowerCase().includes(needle))
      return false;
    if (account !== 'all' && t.accountCode !== account) return false;
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (grantFilter || lineFilter) {
      const parts = partsByTx.get(t.id) ?? [];
      if (
        !parts.some(
          p =>
            (!grantFilter || p.grantId === grantFilter) &&
            (!lineFilter || p.budgetLineId === lineFilter),
        )
      )
        return false;
    }
    return true;
  });

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(params.get('page')) || 1));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const accountCodes = [...new Set(state.grants.transactions.map(t => t.accountCode))].sort();
  const waiting = acceptableSuggestions(state);
  const filtered = !!(
    needle ||
    account !== 'all' ||
    isPeriod(periodParam) ||
    grantFilter ||
    lineFilter
  );

  // --- Changes, each with a toast and an Undo -----------------------------------
  const withUndo = (ids: string[], run: () => void, title: string, message: string) => {
    const before: Array<[string, Snapshot]> = ids.map(id => [id, snapshot(state, id)]);
    run();
    setChanging(s => {
      const next = new Set(s);
      ids.forEach(id => next.delete(id));
      return next;
    });
    toast({
      title,
      message: (
        <span>
          {message}{' '}
          <UndoButton
            onUndo={() => {
              before.forEach(([id, snap]) => restore(actions.grants, id, snap));
              toast({
                tone: 'info',
                title: ids.length > 1 ? 'Put back as they were' : 'Put back as it was',
              });
            }}
          />
        </span>
      ),
    });
  };

  const describe = (tx: Transaction, parts: Allocation[]) =>
    parts.length === 1
      ? `${tx.payee}, ${money(tx.amount)}, to ${lineById(state, parts[0].budgetLineId)?.category ?? 'a line'} on ${grantFunder(state, parts[0].grantId, true)}.`
      : `${tx.payee}, ${money(tx.amount)}: ${joinWords(parts.map(p => `${money(p.amount)} to ${grantFunder(state, p.grantId, true)}`))}.`;

  const assign = (tx: Transaction, parts: Allocation[], note?: string) => {
    withUndo(
      [tx.id],
      () => actions.grants.assignTransaction(tx.id, parts),
      parts.length > 1 ? 'Split saved' : 'Assigned',
      describe(tx, parts) + (note ? ` ${note}` : ''),
    );
  };

  const open = (tx: Transaction) => patch({ tx: tx.id });
  const close = React.useCallback(() => {
    setDraft(undefined);
    patch({ tx: undefined });
  }, [patch]);

  const on: RowHandlers = {
    open,
    assignLine: (tx, budgetLineId) => {
      const line = lineById(state, budgetLineId);
      if (!line) return;
      assign(tx, [{ grantId: line.grantId, budgetLineId, amount: tx.amount }]);
    },
    acceptSuggestion: (tx, suggestion: Suggestion) => {
      if (suggestion.kind === 'line') {
        assign(tx, [
          { grantId: suggestion.grantId, budgetLineId: suggestion.budgetLineId, amount: tx.amount },
        ]);
      } else if (suggestion.kind === 'split') {
        const amounts = splitByPercent(
          tx.amount,
          suggestion.rule.parts.map(p => p.percent),
        );
        assign(
          tx,
          suggestion.rule.parts.map((p, i) => ({
            grantId: p.grantId,
            budgetLineId: p.budgetLineId,
            amount: amounts[i],
          })),
        );
      } else if (suggestion.kind === 'not-grant-funded') {
        on.setAside(tx);
      }
    },
    setAside: tx =>
      withUndo(
        [tx.id],
        () => actions.grants.markNotGrantFunded(tx.id),
        'Set aside as not grant-funded',
        `${tx.payee}, ${money(tx.amount)}. No grant pays for it.`,
      ),
    sendBack: tx =>
      withUndo(
        [tx.id],
        () => actions.grants.unassignTransaction(tx.id),
        'Sent back to assign',
        `${tx.payee}, ${money(tx.amount)} is waiting on the To assign tab again.`,
      ),
    seeInGrant: expense => nav(`/grants/${expense.grantId}?tab=expenses&expense=${expense.id}`),
    setChanging: (tx, want) =>
      setChanging(s => {
        const next = new Set(s);
        if (want) next.add(tx.id);
        else next.delete(tx.id);
        return next;
      }),
  };

  const acceptAll = () => {
    const list = acceptableSuggestions(state);
    if (!list.length) return;
    const setAside = list.filter(w => w.suggestion.kind === 'not-grant-funded').length;
    const assigned = list.length - setAside;
    const parts = [
      assigned ? `${assigned} assigned to budget lines` : '',
      setAside ? `${setAside} set aside as not grant-funded` : '',
    ].filter(Boolean);
    withUndo(
      list.map(w => w.tx.id),
      () => actions.grants.acceptSuggestions(),
      `${list.length} ${list.length === 1 ? 'suggestion' : 'suggestions'} accepted`,
      `${joinWords(parts)}.`,
    );
  };

  const clearFilters = () =>
    patch({
      q: undefined,
      account: undefined,
      period: undefined,
      grant: undefined,
      line: undefined,
    });

  // --- Render -------------------------------------------------------------------
  const grantChip = grantFilter ? grantById(state, grantFilter) : undefined;
  const lineChip = lineFilter ? lineById(state, lineFilter) : undefined;

  const panel = panelTx && (
    <SplitPanel
      key={panelTx.id}
      tx={panelTx}
      onClose={close}
      onDraft={setDraft}
      onSave={(tx, parts, note) => {
        assign(tx, parts, note);
        close();
      }}
    />
  );

  return (
    <WithPanel panel={panel}>
      {!qb.connected && (
        <div className="tx-banner" role="status">
          <Icon name="unplug" size={18} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>QuickBooks is not connected.</strong> What is already here stays, and you can
            keep assigning it. Nothing new comes in until QuickBooks is connected again.
          </div>
          {mayConnect && (
            <Button variant="secondary" size="sm" onClick={() => nav('/settings')}>
              Open Settings
            </Button>
          )}
        </div>
      )}

      <div className="ja-tabs-scroll">
        <Tabs
          tabs={TABS.map(t => ({ id: t.id, label: t.label, count: counts[t.id] }))}
          active={tab}
          onChange={id => patch({ tab: id === 'to-assign' ? undefined : id })}
          style={{ borderBottom: 0 }}
        />
      </div>

      <Card padding="0" style={{ overflow: 'visible' }}>
        <div className="tx-card">
          <div className="ja-filter-bar tx-filters">
            <div className="ja-filter-bar__search">
              <Input
                aria-label="Search payee or memo"
                value={q}
                onChange={e => patch({ q: e.target.value })}
                placeholder="Search payee or memo"
                prefix={<Icon name="search" size={15} />}
                style={{ width: '100%' }}
              />
            </div>
            <div className="ja-filter-bar__select">
              <Select
                aria-label="Account"
                value={account}
                onChange={e =>
                  patch({ account: e.target.value === 'all' ? undefined : e.target.value })
                }
                options={[
                  { value: 'all', label: 'All accounts' },
                  ...accountCodes.map(c => ({ value: c, label: accountLabel(state, c) })),
                ]}
                style={{ width: '100%' }}
              />
            </div>
            <div className="ja-filter-bar__select">
              <Select
                aria-label="Period"
                value={period}
                onChange={e => patch({ period: e.target.value })}
                options={PERIODS}
                style={{ width: '100%' }}
              />
            </div>
            {mayAssign && tab === 'to-assign' && waiting.length > 0 && (
              <div className="tx-filters__accept">
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Icon name="check" size={14} />}
                  onClick={acceptAll}
                >
                  Accept {waiting.length} {waiting.length === 1 ? 'suggestion' : 'suggestions'}
                </Button>
              </div>
            )}
          </div>

          {(grantFilter || lineFilter) && (
            <div className="tx-chips">
              {grantFilter && (
                <Tag
                  color="var(--blue-500)"
                  onRemove={() => patch({ grant: undefined, line: undefined })}
                >
                  Grant: {grantChip?.title ?? 'A removed grant'}
                </Tag>
              )}
              {lineFilter && (
                <Tag color="var(--teal-500)" onRemove={() => patch({ line: undefined })}>
                  Line: {lineChip?.category ?? 'A removed line'}
                  {!grantFilter && lineChip
                    ? `, ${grantFunder(state, lineChip.grantId, true)}`
                    : ''}
                </Tag>
              )}
            </div>
          )}

          {inTab.length === 0 ? (
            <TabEmpty
              tab={tab}
              connected={qb.connected}
              syncing={syncing}
              onSync={maySync ? sync : undefined}
              onSettings={mayConnect ? () => nav('/settings') : undefined}
              lastSynced={syncedLabel(state, today)}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Icon name="search-x" size={22} />}
              title="No transactions match"
              message={
                needle
                  ? `Nothing on this tab matches "${q.trim()}". Try a payee's first word, another account, or a longer period.`
                  : (grantFilter || lineFilter) && tab === 'to-assign'
                    ? 'Transactions waiting to be assigned are not on a grant yet. Look on the Assigned tab, or clear the filters.'
                    : 'Nothing on this tab fits these filters. Try another account or a longer period.'
              }
              action={
                filtered ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="tx-table" role="table" aria-label="Transactions">
              <div className="tx-head" role="row">
                <span>Date</span>
                <span>Payee and memo</span>
                <span>Account</span>
                <span className="tx-num">Amount</span>
                <span>Grant and budget line</span>
              </div>
              {shown.map(tx => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  parts={partsByTx.get(tx.id) ?? []}
                  selected={panelTx?.id === tx.id}
                  draft={draft}
                  changing={changing.has(tx.id)}
                  on={on}
                  mayAssign={mayAssign}
                />
              ))}
            </div>
          )}

          {rows.length > PAGE_SIZE && (
            <div className="tx-pager">
              <span>
                <span className="tx-mono">{(page - 1) * PAGE_SIZE + 1}</span> to{' '}
                <span className="tx-mono">{Math.min(page * PAGE_SIZE, rows.length)}</span> of{' '}
                <span className="tx-mono">{rows.length}</span>
              </span>
              <IconButton
                label="Previous page"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => patch({ page: page - 1 > 1 ? String(page - 1) : undefined })}
              >
                <Icon name="chevron-left" size={16} />
              </IconButton>
              <IconButton
                label="Next page"
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => patch({ page: String(page + 1) })}
              >
                <Icon name="chevron-right" size={16} />
              </IconButton>
            </div>
          )}
          {rows.length > 0 && rows.length <= PAGE_SIZE && tab !== 'to-assign' && (
            <div className="tx-pager">
              <span>
                <span className="tx-mono">{rows.length}</span>{' '}
                {rows.length === 1 ? 'transaction' : 'transactions'}
              </span>
            </div>
          )}
        </div>
      </Card>
    </WithPanel>
  );
}

/** A tab with nothing on it at all, whatever the filters. */
function TabEmpty({
  tab,
  connected,
  syncing,
  onSync,
  onSettings,
  lastSynced,
}: {
  tab: Tab;
  connected: boolean;
  syncing: boolean;
  /** Left out when the role may not sync, or connect, QuickBooks. */
  onSync?: () => void;
  onSettings?: () => void;
  lastSynced: string;
}) {
  if (tab === 'to-assign') {
    return (
      <EmptyState
        icon={<Icon name="circle-check" size={22} />}
        title={EMPTY_TAB[tab].title}
        message={
          connected
            ? `Every transaction is on a budget line or set aside. New spending shows up here after the next sync; the last one was ${lastSynced}.`
            : 'Every transaction is on a budget line or set aside. Connect QuickBooks in Settings to bring in new spending.'
        }
        action={
          connected
            ? onSync && (
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Icon name="refresh-cw" size={15} />}
                  disabled={syncing}
                  onClick={onSync}
                >
                  {syncing ? 'Syncing' : 'Sync now'}
                </Button>
              )
            : onSettings && (
                <Button variant="secondary" size="sm" onClick={onSettings}>
                  Open Settings
                </Button>
              )
        }
      />
    );
  }
  return (
    <EmptyState
      icon={<Icon name="inbox" size={22} />}
      title={EMPTY_TAB[tab].title}
      message={EMPTY_TAB[tab].message}
    />
  );
}
