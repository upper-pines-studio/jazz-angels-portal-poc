import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, Icon } from '../../../../design-system';
import { dateLong, money, useCan, useStore } from '../../../../core';
import { awardLetter, grantLines, isMapped, lineMatched, linePaces } from '../../domain';
import type { BudgetLine, Grant } from '../../domain';
import { CATEGORY_ACCOUNTS } from '../../domain/seed-money';
import { useToast } from '../../../../app/ToastHost';
import { Figures, PaceMark } from '../money/shared';
import { BudgetLineEditor } from './BudgetLineEditor';
import { BudgetRowMenu } from './BudgetRowMenu';
import {
  BudgetAccountChips,
  BudgetAttention,
  BudgetClassMark,
  BudgetMatched,
  BudgetOk,
  budgetPacingHref,
  budgetTransactionsHref,
} from './budgetBits';
import './budget.css';

/** Which row is open for editing: a line's id, a new line at the foot, or none. */
type Editing = { id: string | 'new'; removing?: boolean } | null;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The approved budget for a grant, line by line, and how each line maps to
 * QuickBooks: the accounts whose spending counts on it and the class that
 * marks it as this grant's. Lines are edited in place, one at a time.
 */
export function BudgetTab({ grant }: { grant: Grant }) {
  const { state, today, actions } = useStore();
  // Budget lines are award records.
  const mayEdit = useCan()('award', 'edit');
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // `?edit=<lineId>` or `?edit=new` opens a row in the editor; it is read once, then dropped.
  const [editing, setEditing] = React.useState<Editing>(() => {
    const id = params.get('edit');
    return id && mayEdit ? { id } : null;
  });
  React.useEffect(() => {
    if (!params.has('edit')) return;
    const next = new URLSearchParams(params);
    next.delete('edit');
    setParams(next, { replace: true });
  }, [params, setParams]);
  const dirty = React.useRef(false);
  const setDirty = React.useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  const lines = grantLines(state, grant.id);
  const paces = new Map(linePaces(state, grant.id, today).map(p => [p.line.id, p]));
  const highlight = params.get('line');
  const qbConnected = state.grants.quickbooks.connected;

  const awarded = grant.amountAwarded;
  const budgeted = lines.reduce((sum, l) => sum + l.planned, 0);
  const matched = lines.reduce(
    (acc, l) => {
      const m = lineMatched(state, l.id);
      return { amount: acc.amount + m.amount, count: acc.count + m.count };
    },
    { amount: 0, count: 0 },
  );
  const mapped = lines.filter(isMapped).length;
  const unmapped = lines.length - mapped;
  const gap = awarded === undefined ? undefined : awarded - budgeted;
  const letter = awardLetter(state, grant.id);

  // Bring a linked line into view once, when the tab opens on it.
  React.useEffect(() => {
    if (!highlight) return;
    const id = window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-budget-line="${CSS.escape(highlight)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [highlight]);

  /** Open a row for editing, unless another row has changes that would be lost. */
  const open = (next: Editing) => {
    if (!mayEdit) return;
    if (editing && next && editing.id === next.id) {
      if (next.removing && !editing.removing) setEditing(next);
      return;
    }
    if (editing && dirty.current) {
      toast({
        tone: 'info',
        title: 'Finish the line you are editing',
        message: 'Save it or cancel it first, then open the next one.',
      });
      return;
    }
    setEditing(next);
  };

  const close = () => setEditing(null);
  const saved = (id: string) => {
    setEditing(null);
    const next = new URLSearchParams(params);
    next.set('line', id);
    setParams(next, { replace: true });
  };

  const startFromUsual = () => {
    for (const [category, codes] of Object.entries(CATEGORY_ACCOUNTS)) {
      actions.grants.addBudgetLine({
        grantId: grant.id,
        category,
        planned: 0,
        accountCodes: [...codes],
      });
    }
    toast({
      tone: 'success',
      title: 'Five lines added',
      message: 'Set the approved amount on each, then pick the QuickBooks class this grant uses.',
    });
  };

  const unallocatedNote =
    gap === undefined ? (
      'No award on record yet'
    ) : gap === 0 ? (
      <BudgetOk>Budget matches the award</BudgetOk>
    ) : gap > 0 ? (
      `${money(gap)} of the award is not on a line yet`
    ) : (
      <BudgetAttention>Budget is {money(-gap)} over the award</BudgetAttention>
    );

  const figures = (
    <Figures
      items={[
        {
          label: 'Awarded',
          value: awarded === undefined ? 'Not set' : money(awarded),
          note: grant.dates.decided
            ? `${letter ? 'Award letter' : 'Awarded'}, ${dateLong(grant.dates.decided)}`
            : letter
              ? `Award letter, ${dateLong(letter.uploadedAt.slice(0, 10))}`
              : 'No award letter on file',
        },
        {
          label: 'Budgeted',
          value: money(budgeted),
          note: lines.length ? `Across ${plural(lines.length, 'line')}` : 'No lines yet',
        },
        {
          label: 'Unallocated',
          value: gap === undefined ? money(0) : money(Math.abs(gap)),
          note: unallocatedNote,
        },
        {
          label: 'Lines',
          value: lines.length,
          note: lines.length
            ? 'From the approved budget'
            : 'Add the categories from the approved budget',
        },
        {
          label: 'Mapped',
          value: mapped,
          unit: `of ${lines.length}`,
          note:
            lines.length === 0 ? (
              'Nothing to map yet'
            ) : unmapped === 0 ? (
              <BudgetOk>Every line is mapped</BudgetOk>
            ) : (
              <BudgetAttention>
                {unmapped === 1 ? '1 line needs' : `${unmapped} lines need`} an account or a class
              </BudgetAttention>
            ),
        },
      ]}
    />
  );

  const band = (
    <div className="budget-band">
      <h4>Budget lines</h4>
      <span className="budget-band__note">
        A QuickBooks transaction matches a line when its account and class both match.
      </span>
      {mayEdit && (
        <span className="budget-band__action">
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Icon name="plus" size={14} />}
            onClick={() => open({ id: 'new' })}
          >
            Add line
          </Button>
        </span>
      )}
    </div>
  );

  const qbNote = !qbConnected && (
    <div className="budget-qb-note">
      <Icon name="unplug" size={14} />
      <span>
        QuickBooks is not connected. You can still set accounts and classes here; matching resumes
        when QuickBooks is connected again. <Link to="/settings">Connect in Settings</Link>
      </span>
    </div>
  );

  if (lines.length === 0 && editing?.id !== 'new') {
    return (
      <div>
        {figures}
        {band}
        {qbNote}
        <EmptyState
          icon={<Icon name="list" size={22} />}
          title="No budget lines yet"
          message={
            mayEdit
              ? 'Lines appear here once you add the categories from the approved budget. Each one maps to QuickBooks accounts and a class, so spending finds its own way here.'
              : 'Lines appear here once someone adds the categories from the approved budget.'
          }
          action={
            mayEdit && (
              <span className="budget-empty-actions">
                <Button variant="primary" onClick={startFromUsual}>
                  Start from the usual five categories
                </Button>
                <Button
                  variant="secondary"
                  iconLeft={<Icon name="plus" size={14} />}
                  onClick={() => open({ id: 'new' })}
                >
                  Add line
                </Button>
              </span>
            )
          }
        />
      </div>
    );
  }

  const totalNote =
    gap === undefined ? (
      <span className="budget-total__note">No award on record</span>
    ) : gap === 0 ? (
      <BudgetOk>Equals the award</BudgetOk>
    ) : gap > 0 ? (
      <span className="budget-total__note">{money(gap)} under the award</span>
    ) : (
      <BudgetAttention>{money(-gap)} over the award</BudgetAttention>
    );

  const row = (line: BudgetLine) => {
    if (mayEdit && editing?.id === line.id) {
      return (
        <BudgetLineEditor
          key={`${line.id}-edit`}
          grant={grant}
          line={line}
          lines={lines}
          startRemoving={editing.removing}
          onClose={close}
          onSaved={saved}
          onDirty={setDirty}
        />
      );
    }
    const pace = paces.get(line.id);
    const showPace = pace && (pace.status === 'spending-fast' || pace.status === 'spending-slow');
    return (
      <div
        key={line.id}
        data-budget-line={line.id}
        className={`budget-row budget-row--line${highlight === line.id ? ' is-highlighted' : ''}`}
        onClick={mayEdit ? () => open({ id: line.id }) : undefined}
        style={mayEdit ? undefined : { cursor: 'default' }}
      >
        <span className="budget-cell budget-cell--cat">
          <span className="budget-cat">{line.category}</span>
          {showPace && <PaceMark status={pace.status} />}
        </span>
        <span className="budget-cell budget-cell--amt budget-num">{money(line.planned)}</span>
        <span className="budget-cell budget-cell--acc">
          <BudgetAccountChips codes={line.accountCodes} />
        </span>
        <span className="budget-cell budget-cell--cls">
          <BudgetClassMark classId={line.classId} />
        </span>
        <span className="budget-cell budget-cell--match">
          <BudgetMatched grantId={grant.id} lineId={line.id} />
        </span>
        <span className="budget-cell budget-cell--menu" onClick={e => e.stopPropagation()}>
          <BudgetRowMenu
            label={`Actions for ${line.category}`}
            items={[
              ...(mayEdit
                ? [
                    {
                      label: 'Edit line',
                      icon: 'pencil',
                      onSelect: () => open({ id: line.id }),
                    },
                  ]
                : []),
              {
                label: 'View transactions',
                icon: 'receipt',
                onSelect: () => navigate(budgetTransactionsHref(grant.id, line.id)),
              },
              {
                label: 'See pacing',
                icon: 'gauge',
                onSelect: () => navigate(budgetPacingHref(grant.id)),
              },
              ...(mayEdit
                ? [
                    {
                      label: 'Remove line',
                      icon: 'trash-2',
                      danger: true,
                      onSelect: () => open({ id: line.id, removing: true }),
                    },
                  ]
                : []),
            ]}
          />
        </span>
      </div>
    );
  };

  return (
    <div>
      {figures}
      {band}
      {qbNote}
      <div className="budget-scroll">
        <div className="budget-table" role="table" aria-label={`Budget lines for ${grant.title}`}>
          <div className="budget-row budget-row--head" role="row">
            <span className="budget-cell--cat" role="columnheader">
              Category
            </span>
            <span className="budget-cell--amt budget-right" role="columnheader">
              Approved
            </span>
            <span className="budget-cell--acc" role="columnheader">
              QuickBooks accounts
            </span>
            <span className="budget-cell--cls" role="columnheader">
              QuickBooks class
            </span>
            <span className="budget-cell--match budget-right" role="columnheader">
              Matched so far
            </span>
            <span className="budget-cell--menu" aria-hidden="true" />
          </div>

          {lines.map(row)}

          {mayEdit && editing?.id === 'new' && (
            <BudgetLineEditor
              key="new"
              grant={grant}
              lines={lines}
              onClose={close}
              onSaved={saved}
              onDirty={setDirty}
            />
          )}

          {lines.length > 0 && (
            <div className="budget-row budget-row--total">
              <span className="budget-cell budget-cell--cat budget-total__label">
                <strong>Total</strong>
                {totalNote}
              </span>
              <span className="budget-cell budget-cell--amt budget-num budget-total__num">
                {money(budgeted)}
              </span>
              <span className="budget-cell budget-cell--acc budget-hide-sm" />
              <span className="budget-cell budget-cell--cls budget-hide-sm" />
              <span className="budget-cell budget-cell--match">
                {matched.count > 0 ? (
                  <button
                    type="button"
                    className="budget-match budget-match--link"
                    aria-label={`${money(matched.amount)} matched from ${plural(matched.count, 'expense')}. View transactions`}
                    title="View every transaction on this grant"
                    onClick={() => navigate(budgetTransactionsHref(grant.id))}
                  >
                    <span className="budget-match__amt">{money(matched.amount)}</span>
                    <span className="budget-match__n">{matched.count}</span>
                  </button>
                ) : (
                  <span className="budget-match budget-match--none">Nothing yet</span>
                )}
              </span>
              <span className="budget-cell budget-cell--menu" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
