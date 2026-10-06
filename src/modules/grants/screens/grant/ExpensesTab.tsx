import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, EmptyState, Icon } from '../../../../design-system';
import { dateShort, money, useStore } from '../../../../core';
import {
  accountLabel,
  backupSummary,
  className,
  expenseFiles,
  funderById,
  lineById,
  syncedLabel,
  transactionById,
} from '../../domain';
import type { Expense, Grant } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { Figures, downloadText, toCsv } from '../money/shared';
import { LogExpenseDialog } from './ExpenseDialogs';
import { expensesLabel, filesLabel, partCounts, useExpenseView } from './expenseList';
import './expenses.css';

export { ExpenseAside } from './ExpenseDetail';

/** Lists longer than this scroll inside the card instead of stretching the page. */
const CAP_ROWS = 12;

/** "Herb Alpert Foundation" → "herb-alpert", for the download's file name. */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\b(foundation|the|inc|of)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'grant'
  );
}

/**
 * The Expenses tab: every expense counted against this grant, with its backup.
 * Clicking a row opens it in the right-hand column (`ExpenseAside`) through the URL.
 */
export function ExpensesTab({ grant }: { grant: Grant }) {
  const { state, today } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const view = useExpenseView(grant);
  const [logging, setLogging] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  const summary = backupSummary(state, grant.id);
  const parts = partCounts(state);
  const qb = state.grants.quickbooks;

  // Keep the chosen row in sight when the list scrolls on its own, or when the aside walks it.
  React.useEffect(() => {
    const body = bodyRef.current;
    if (!body || !view.selectedId) return;
    const row = body.querySelector<HTMLElement>(`[data-expense="${CSS.escape(view.selectedId)}"]`);
    if (!row || body.scrollHeight <= body.clientHeight) return;
    const top = row.offsetTop;
    if (top < body.scrollTop) body.scrollTop = top;
    else if (top + row.offsetHeight > body.scrollTop + body.clientHeight)
      body.scrollTop = top + row.offsetHeight - body.clientHeight;
  }, [view.selectedId, view.filter]);

  const choose = (id: string) => {
    view.select(id);
    // On a narrow screen the detail sits below the list; take the reader to it.
    if (window.matchMedia('(max-width: 900px)').matches) {
      window.setTimeout(
        () =>
          document
            .getElementById('expense-detail')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        60,
      );
    }
  };

  const downloadIndex = () => {
    const funder = funderById(state, grant.funderId);
    const header = [
      'Date',
      'Payee',
      'Budget line',
      'Amount',
      'QuickBooks account',
      'QuickBooks class',
      'QuickBooks reference',
      'Description',
      'Backup files',
      'Backup note',
    ];
    const rows = view.all.map((e: Expense) => {
      const tx = transactionById(state, e.transactionId);
      const files = expenseFiles(state, e.id);
      return [
        e.date,
        e.payee,
        lineById(state, e.budgetLineId)?.category ?? '',
        e.amount,
        tx ? accountLabel(state, tx.accountCode) : 'Entered by hand',
        tx ? (className(state, tx.classId) ?? '') : '',
        tx ? tx.ref : '',
        e.note ?? '',
        files.length ? files.map(f => f.name).join('; ') : 'MISSING',
        e.backupNote ?? '',
      ];
    });
    rows.push([
      '',
      `${expensesLabel(summary.expenses)}`,
      '',
      summary.total,
      '',
      '',
      '',
      '',
      filesLabel(summary.files),
      '',
    ]);
    const name = `${slug(funder?.name ?? grant.title)}-backup-index.csv`;
    downloadText(name, toCsv([header, ...rows]));
    toast({
      tone: 'success',
      title: `Downloaded ${name}`,
      message: `An index of ${expensesLabel(summary.expenses)} and ${filesLabel(summary.files)}${summary.missing ? `, with ${summary.missing} marked missing` : ''}. The demo keeps each file's details, not its contents, so the index is the whole download.`,
    });
  };

  const logDialog = logging && (
    <LogExpenseDialog
      grant={grant}
      onClose={() => setLogging(false)}
      onSaved={(id, input) => {
        setLogging(false);
        view.patch({ expense: id, backup: null });
        toast({
          tone: 'success',
          title: 'Expense logged',
          message: `${input.payee}, ${money(input.amount)}, entered by hand. Add its receipt in the column on the right.`,
        });
      }}
    />
  );

  if (view.all.length === 0) {
    return (
      <div className="ja-exp">
        <EmptyState
          icon={<Icon name="receipt" size={22} />}
          title="Nothing spent against this grant yet"
          message="Expenses arrive from QuickBooks. Assign a transaction to one of this grant's budget lines on the Transactions screen and it shows up here, ready for its receipt."
          action={
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <Button variant="primary" onClick={() => nav('/transactions?tab=to-assign')}>
                Go to Transactions
              </Button>
              <Button variant="ghost" onClick={() => setLogging(true)}>
                Log an expense by hand
              </Button>
            </div>
          }
        />
        {logDialog}
      </div>
    );
  }

  const shownTotal = view.shown.reduce((sum, e) => sum + e.amount, 0);
  const shownFiles = view.shown.reduce((sum, e) => sum + (view.counts.get(e.id) ?? 0), 0);
  const capped = view.shown.length > CAP_ROWS;

  return (
    <div className="ja-exp">
      <Figures
        items={[
          { label: 'Expenses', value: summary.expenses, unit: money(summary.total) },
          { label: 'Backup attached', value: summary.withBackup, unit: filesLabel(summary.files) },
          {
            label: 'Missing backup',
            value: summary.missing,
            unit: summary.missing ? (
              <span style={{ color: 'var(--gold-700)' }}>{money(summary.missingTotal)}</span>
            ) : (
              'none'
            ),
          },
        ]}
        trailing={
          <div className="ja-exp__download">
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Icon name="download" size={15} />}
              onClick={downloadIndex}
            >
              Download all backup
            </Button>
            <span>A spreadsheet index of every expense, for audits</span>
          </div>
        }
      />

      <div className="ja-exp__band">
        <span className="ja-exp__sync">
          <Icon name="refresh-cw" size={13} />
          {qb.connected ? (
            <>
              From QuickBooks, synced {syncedLabel(state, today)}. Newest first.
              {capped && ` All ${view.shown.length} shown; the list scrolls.`}
            </>
          ) : (
            <>QuickBooks is not connected, so nothing new is arriving. Newest first.</>
          )}
        </span>
        <div className="ja-exp__seg" role="group" aria-label="Which expenses to show">
          <button
            type="button"
            aria-pressed={view.filter === 'all'}
            className={view.filter === 'all' ? 'is-on' : undefined}
            onClick={() => view.setFilter('all')}
          >
            All <span className="ja-exp__count">{view.all.length}</span>
          </button>
          <button
            type="button"
            aria-pressed={view.filter === 'missing'}
            className={view.filter === 'missing' ? 'is-on' : undefined}
            onClick={() => view.setFilter('missing')}
          >
            Missing a receipt <span className="ja-exp__count">{view.missing.length}</span>
          </button>
        </div>
      </div>

      {view.shown.length === 0 ? (
        <EmptyState
          icon={<Icon name="circle-check" size={22} />}
          title="Every expense has its backup"
          message={`Nothing on this grant is missing a receipt. All ${expensesLabel(view.all.length)} have their files.`}
          action={
            <Button variant="secondary" onClick={() => view.setFilter('all')}>
              Show all expenses
            </Button>
          }
        />
      ) : (
        <div className="ja-exp__table">
          <div className="ja-exp__row ja-exp__head">
            <span>Date</span>
            <span>Payee</span>
            <span className="ja-exp__line">Budget line</span>
            <span className="ja-exp__num">Amount</span>
            <span>Backup</span>
          </div>
          <div ref={bodyRef} className={'ja-exp__body' + (capped ? ' is-capped' : '')}>
            {view.shown.map(e => {
              const n = view.counts.get(e.id) ?? 0;
              const line = lineById(state, e.budgetLineId)?.category ?? 'No line';
              const split = !!e.transactionId && (parts.get(e.transactionId) ?? 0) > 1;
              const on = e.id === view.selectedId;
              return (
                <button
                  key={e.id}
                  type="button"
                  data-expense={e.id}
                  className={'ja-exp__row ja-exp__item' + (on ? ' is-selected' : '')}
                  aria-current={on ? 'true' : undefined}
                  onClick={() => (on ? view.select(null) : choose(e.id))}
                >
                  <span className="ja-exp__mono">{dateShort(e.date)}</span>
                  <span className="ja-exp__payee">
                    <span className="ja-exp__payee-name">
                      <strong>{e.payee}</strong>
                      {split && <span className="ja-exp__tag">Split</span>}
                      {!e.transactionId && <span className="ja-exp__tag">By hand</span>}
                    </span>
                    <span className="ja-exp__payee-line">{line}</span>
                  </span>
                  <span className="ja-exp__line">{line}</span>
                  <span className="ja-exp__mono ja-exp__num">{money(e.amount)}</span>
                  <span>
                    {n > 0 ? (
                      <span className="ja-exp__files">
                        <Icon name="paperclip" size={14} />
                        {filesLabel(n)}
                      </span>
                    ) : (
                      <Badge tone="gold" dot>
                        Missing
                      </Badge>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="ja-exp__row ja-exp__total">
            <span />
            <span>
              {expensesLabel(view.shown.length)}
              {view.filter === 'missing' && ' missing a receipt'}
            </span>
            <span className="ja-exp__line" />
            <span className="ja-exp__mono ja-exp__num">{money(shownTotal)}</span>
            <span className="ja-exp__small">
              {view.filter === 'missing' ? 'No files' : filesLabel(shownFiles)}
            </span>
          </div>
        </div>
      )}

      <div className="ja-exp__foot">
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<Icon name="pencil-line" size={14} />}
          onClick={() => setLogging(true)}
        >
          Log an expense by hand
        </Button>
        <span>For something that never went through QuickBooks.</span>
      </div>

      {logDialog}
    </div>
  );
}
