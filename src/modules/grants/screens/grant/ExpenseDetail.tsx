import React from 'react';
import { Badge, Button, Card, Icon, IconButton, Textarea } from '../../../../design-system';
import { dateLong, dateShort, money, staffById, useStore } from '../../../../core';
import {
  accountLabel,
  backupSummary,
  className,
  expenseFiles,
  lineById,
  transactionById,
} from '../../domain';
import type { Expense, Grant, GrantFile } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { Eyebrow } from '../../../../app/components/badges';
import { LinkButton } from '../money/shared';
import {
  FILE_KIND_LABEL,
  FileDrop,
  FilePaper,
  FileViewerDialog,
  describeFile,
  downloadFile,
  forgetFile,
  guessKind,
  rememberFile,
} from '../money/files';
import { fileSize } from '../../domain';
import { ReassignDialog } from './ExpenseDialogs';
import { expensesLabel, filesLabel, useExpenseView } from './expenseList';
import './expenses.css';

/** File actions sit three across in a narrow column. */
const TIGHT: React.CSSProperties = { paddingLeft: 6, paddingRight: 6, gap: 5 };

/** Wide enough that the detail sits beside the list rather than under it. */
const WIDE = '(min-width: 901px)';

/**
 * The right-hand column of the Expenses tab: the chosen expense, where it came
 * from, and the receipts and invoices behind it.
 */
export function ExpenseAside({ grant }: { grant: Grant }) {
  const view = useExpenseView(grant);
  const opened = React.useRef<string | null>(null);

  // A link to an expense that has since gone (sent back, deleted): drop it quietly.
  const stale = !!view.selectedId && !view.selected;
  React.useEffect(() => {
    if (stale) view.select(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale]);

  // On a wide screen, open with something chosen so the column is never empty:
  // the newest expense still missing its backup, else the newest one.
  React.useEffect(() => {
    if (opened.current === grant.id) return;
    opened.current = grant.id;
    if (view.selectedId || !window.matchMedia(WIDE).matches) return;
    const pick = view.shown.find(e => !view.counts.get(e.id)) ?? view.shown[0];
    if (pick) view.select(pick.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant.id]);

  return (
    <div id="expense-detail" className="ja-exp-aside">
      {view.selected ? (
        <ExpenseCard key={view.selected.id} grant={grant} expense={view.selected} view={view} />
      ) : (
        <IdleCard grant={grant} view={view} />
      )}
    </div>
  );
}

type View = ReturnType<typeof useExpenseView>;

/** Nothing chosen: say how to choose, and how the grant's backup stands. */
function IdleCard({ grant, view }: { grant: Grant; view: View }) {
  const { state } = useStore();
  const s = backupSummary(state, grant.id);

  let sentence: string;
  if (s.expenses === 0)
    sentence = 'Nothing has been spent against this grant yet, so there is no backup to keep.';
  else if (s.missing === 0)
    sentence = `All ${expensesLabel(s.expenses)} have their backup, ${filesLabel(s.files)} in all.`;
  else {
    sentence =
      `${s.withBackup} of ${expensesLabel(s.expenses)} have their backup, ${filesLabel(s.files)} in all. ` +
      `${s.missing} ${s.missing === 1 ? 'is' : 'are'} missing a receipt, ${money(s.missingTotal)} together.`;
  }

  const firstMissing = view.missing[0];
  return (
    <Card padding="var(--space-5)">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          alignItems: 'flex-start',
        }}
      >
        <span className="ja-exp-aside__icon">
          <Icon name="receipt" size={18} />
        </span>
        <h3
          style={{
            margin: 0,
            font: 'var(--weight-semibold) var(--text-base)/1.3 var(--font-sans)',
            color: 'var(--text-strong)',
            letterSpacing: 0,
          }}
        >
          {s.expenses ? 'Choose an expense to see its backup' : 'No expenses yet'}
        </h3>
        <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
          {sentence}
        </p>
        {firstMissing && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => view.patch({ backup: 'missing', expense: firstMissing.id })}
          >
            Start with the missing ones
          </Button>
        )}
      </div>
    </Card>
  );
}

/** "Came from QuickBooks as bill 1047, assigned by Denise Moreno on Jul 19." */
function provenance(ref: string): string {
  return /\d/.test(ref) ? ref.charAt(0).toLowerCase() + ref.slice(1) : `an ${ref.toLowerCase()}`;
}

function ExpenseCard({ grant, expense, view }: { grant: Grant; expense: Expense; view: View }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [reassigning, setReassigning] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const files = expenseFiles(state, expense.id);
  const line = lineById(state, expense.budgetLineId);
  const tx = transactionById(state, expense.transactionId);
  const parts = tx ? state.grants.expenses.filter(e => e.transactionId === tx.id) : [];
  const assigner = staffById(state, tx?.assignedById);

  // Walk the list the reader is looking at; if this expense has left the filter, walk them all.
  const list = view.shown.some(e => e.id === expense.id) ? view.shown : view.all;
  const at = list.findIndex(e => e.id === expense.id);
  const prev = at > 0 ? list[at - 1] : undefined;
  const next = at >= 0 && at < list.length - 1 ? list[at + 1] : undefined;

  const onFiles = (picked: File[]) => {
    const before = files.length;
    const added: string[] = [];
    for (const file of picked) {
      const d = describeFile(file);
      if ('error' in d) {
        toast({ tone: 'info', title: 'That file was not added', message: d.error });
        continue;
      }
      const id = actions.grants.addFile({
        grantId: grant.id,
        expenseId: expense.id,
        kind: guessKind(d.format),
        name: d.name,
        format: d.format,
        sizeKb: d.sizeKb,
      });
      rememberFile(id, file);
      added.push(d.name);
    }
    if (!added.length) return;
    const what = added.length === 1 ? added[0] : filesLabel(added.length);
    const after =
      before === 0
        ? view.filter === 'missing'
          ? 'Its backup is complete, so it has left the Missing list.'
          : 'Its backup is complete.'
        : `It has ${filesLabel(before + added.length)} now.`;
    toast({
      tone: 'success',
      title: 'Backup added',
      message: `${what} is with ${expense.payee}. ${after}`,
    });
  };

  const removeAll = (expenseIds: string[]) => {
    for (const f of state.grants.files) {
      if (f.expenseId && expenseIds.includes(f.expenseId)) forgetFile(f.id);
    }
  };

  const sendBack = () => {
    if (!tx) return;
    removeAll(parts.map(p => p.id));
    view.select(null);
    actions.grants.unassignTransaction(tx.id);
    toast({
      tone: 'success',
      title: 'Sent back to Transactions',
      message: `${tx.ref} from ${tx.payee}, ${money(tx.amount)}, is waiting to be assigned again.${files.length ? ' Its backup was removed.' : ''}`,
    });
  };

  const deleteByHand = () => {
    removeAll([expense.id]);
    view.select(null);
    actions.grants.deleteExpense(expense.id);
    toast({
      tone: 'success',
      title: 'Expense deleted',
      message: `${expense.payee}, ${money(expense.amount)}, is off ${line?.category ?? 'the budget'}.`,
    });
  };

  const partsNote =
    parts.length > 1 ? ` for ${money(tx?.amount)}, split across ${parts.length} budget lines` : '';

  return (
    <Card padding="0">
      <div className="ja-exp-aside__head">
        <div className="ja-exp-aside__top">
          <Eyebrow>Expense</Eyebrow>
          <span className="ja-exp-aside__nav">
            <IconButton
              label="Previous expense"
              size="sm"
              variant="ghost"
              disabled={!prev}
              onClick={() => prev && view.select(prev.id)}
            >
              <Icon name="chevron-left" size={15} />
            </IconButton>
            {at >= 0 && (
              <span>
                {at + 1} of {list.length}
              </span>
            )}
            <IconButton
              label="Next expense"
              size="sm"
              variant="ghost"
              disabled={!next}
              onClick={() => next && view.select(next.id)}
            >
              <Icon name="chevron-right" size={15} />
            </IconButton>
            <IconButton
              label="Close the expense"
              size="sm"
              variant="ghost"
              onClick={() => view.select(null)}
            >
              <Icon name="x" size={15} />
            </IconButton>
          </span>
        </div>
        <h3 className="ja-exp-aside__payee">{expense.payee}</h3>
        <div className="ja-exp-aside__amount">
          <span className="ja-exp-aside__money">{money(expense.amount)}</span>
          <span className="ja-exp-aside__date">{dateLong(expense.date)}</span>
          <span style={{ marginLeft: 'auto' }}>
            {files.length ? (
              <Badge tone="teal" dot>
                Backup complete
              </Badge>
            ) : (
              <Badge tone="gold" dot>
                Missing backup
              </Badge>
            )}
          </span>
        </div>
      </div>

      <div className="ja-exp-aside__body">
        <Row
          k="Budget line"
          v={
            line ? (
              <LinkButton
                onClick={() =>
                  view.patch({ tab: 'budget', line: line.id, expense: null, backup: null })
                }
              >
                {line.category}
              </LinkButton>
            ) : (
              'No line'
            )
          }
        />
        <Row
          k="Description"
          v={expense.note ?? <span style={{ color: 'var(--text-faint)' }}>None given</span>}
        />
        {tx ? (
          <>
            <Row k="QuickBooks account" mono v={accountLabel(state, tx.accountCode)} />
            <Row
              k="QuickBooks class"
              v={
                className(state, tx.classId) ?? (
                  <span style={{ color: 'var(--text-faint)' }}>No class</span>
                )
              }
            />
          </>
        ) : (
          <Row k="Source" v="Entered by hand" />
        )}
        <div className="ja-exp-aside__qb">
          <Icon name="lock" size={14} />
          {tx ? (
            <span>
              Came from QuickBooks as {provenance(tx.ref)}
              {partsNote}
              {assigner ? (
                <>
                  , assigned by {assigner.name}
                  {tx.assignedAt && (
                    <>
                      {' '}
                      on <span className="ja-exp-aside__mono">{dateShort(tx.assignedAt)}</span>
                    </>
                  )}
                </>
              ) : (
                ''
              )}
              . Amounts are read only here.
            </span>
          ) : (
            <span>
              Entered by hand, for something that never went through QuickBooks. Only the portal
              knows about it.
            </span>
          )}
        </div>
      </div>

      <div className="ja-exp-aside__section">
        <h4>Backup</h4>
        <span className="ja-exp__count">{files.length}</span>
      </div>
      {files.length === 0 && (
        <p className="ja-exp-aside__empty">
          No receipt or invoice yet. Add one below so this expense is ready for an audit.
        </p>
      )}
      {files.map(f => (
        <FileRow key={f.id} file={f} expense={expense} remaining={files.length - 1} />
      ))}
      <div className="ja-exp-aside__drop">
        <FileDrop onFiles={onFiles} />
      </div>

      <NoteField key={expense.id} expense={expense} />

      <div className="ja-exp-aside__move">
        {!confirming ? (
          <div className="ja-exp-aside__move-actions">
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Icon name="arrow-right-left" size={14} />}
              onClick={() => setReassigning(true)}
            >
              Reassign
            </Button>
            {tx ? (
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<Icon name="undo-2" size={14} />}
                onClick={() => setConfirming(true)}
              >
                Send back to Transactions
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<Icon name="trash-2" size={14} />}
                style={{ color: 'var(--danger-500)' }}
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            )}
          </div>
        ) : (
          <div className="ja-exp-aside__confirm" role="alert">
            <p>
              {tx ? (
                <>
                  This takes{' '}
                  {parts.length > 1 ? `all ${parts.length} parts of ${tx.ref}` : 'the expense'} off
                  the budget
                  {files.length
                    ? ` and deletes ${files.length === 1 ? 'its backup file' : `its ${files.length} backup files`}`
                    : ''}
                  . The transaction goes back to the To assign list on Transactions. QuickBooks is
                  not changed.
                </>
              ) : (
                <>
                  This deletes the expense
                  {files.length
                    ? ` and ${files.length === 1 ? 'its backup file' : `its ${files.length} backup files`}`
                    : ''}
                  . It cannot be undone.
                </>
              )}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Button variant="danger" size="sm" onClick={tx ? sendBack : deleteByHand}>
                {tx ? 'Send back' : 'Delete expense'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </div>
          </div>
        )}
      </div>

      {reassigning && (
        <ReassignDialog
          grant={grant}
          expense={expense}
          onClose={() => setReassigning(false)}
          onSaved={lineId => {
            actions.grants.updateExpense(expense.id, { budgetLineId: lineId });
            setReassigning(false);
            toast({
              tone: 'success',
              title: 'Expense moved',
              message: `${expense.payee}, ${money(expense.amount)}, now counts against ${lineById(state, lineId)?.category ?? 'that line'}.`,
            });
          }}
        />
      )}
    </Card>
  );
}

function Row({ k, v, mono = false }: { k: React.ReactNode; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="ja-exp-aside__kv">
      <span className="ja-exp-aside__k">{k}</span>
      <span className={'ja-exp-aside__v' + (mono ? ' ja-exp-aside__mono' : '')}>{v}</span>
    </div>
  );
}

/** One backup file: its picture, what it is, who added it, and what can be done with it. */
function FileRow({
  file,
  expense,
  remaining,
}: {
  file: GrantFile;
  expense: Expense;
  remaining: number;
}) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [viewing, setViewing] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const who = staffById(state, file.uploadedById)?.name ?? 'someone';
  const kind =
    file.kind === 'receipt' && file.format !== 'pdf' ? 'Receipt photo' : FILE_KIND_LABEL[file.kind];

  const remove = () => {
    actions.grants.deleteFile(file.id);
    forgetFile(file.id);
    toast({
      tone: 'success',
      title: 'File removed',
      message: `${file.name} is gone. ${remaining ? `${expense.payee} has ${filesLabel(remaining)} left.` : `${expense.payee} is missing its backup now.`}`,
    });
  };

  return (
    <div className="ja-exp-file">
      <button
        type="button"
        className="ja-exp-file__thumb"
        aria-label={`Open ${file.name}`}
        onClick={() => setViewing(true)}
      >
        <FilePaper file={file} />
      </button>
      <div className="ja-exp-file__info">
        <span className="ja-exp-file__name" title={file.name}>
          {file.name}
        </span>
        <span className="ja-exp-file__meta">
          {kind}
          {file.pages ? ` · ${file.pages} ${file.pages === 1 ? 'page' : 'pages'}` : ''} ·{' '}
          <span className="ja-exp-aside__mono">{fileSize(file.sizeKb)}</span>
        </span>
        <span className="ja-exp-file__meta">
          Added by {who}, <span className="ja-exp-aside__mono">{dateShort(file.uploadedAt)}</span>
        </span>
        {removing ? (
          <span className="ja-exp-file__confirm">
            Remove this file?
            <button type="button" className="is-danger" onClick={remove}>
              Remove
            </button>
            <button type="button" onClick={() => setRemoving(false)}>
              Keep
            </button>
          </span>
        ) : (
          <span className="ja-exp-file__actions">
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Icon name="external-link" size={13} />}
              style={TIGHT}
              onClick={() => setViewing(true)}
            >
              Open
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Icon name="download" size={13} />}
              style={TIGHT}
              onClick={() => downloadFile(file)}
            >
              Download
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Icon name="trash-2" size={13} />}
              style={{ ...TIGHT, color: 'var(--danger-500)' }}
              onClick={() => setRemoving(true)}
            >
              Remove
            </Button>
          </span>
        )}
      </div>
      {viewing && <FileViewerDialog file={file} onClose={() => setViewing(false)} />}
    </div>
  );
}

/** The remark kept with the backup. Saves when the field loses focus, or with Save. */
function NoteField({ expense }: { expense: Expense }) {
  const { actions } = useStore();
  const toast = useToast();
  const saved = expense.backupNote ?? '';
  const [draft, setDraft] = React.useState(saved);
  const last = React.useRef(saved);
  const wrap = React.useRef<HTMLDivElement | null>(null);
  const dirty = draft.trim() !== last.current.trim();

  const save = () => {
    const text = draft.trim();
    if (text === last.current.trim()) return;
    last.current = text;
    actions.grants.updateExpense(expense.id, { backupNote: text || undefined });
    toast({
      tone: 'success',
      title: text ? 'Note saved' : 'Note cleared',
      message: `On ${expense.payee}. It goes out with the audit download.`,
    });
  };

  return (
    <div
      ref={wrap}
      className="ja-exp-aside__note"
      onBlur={e => {
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) save();
      }}
    >
      <label>
        <span className="ja-exp-aside__label">Note</span>
        <Textarea
          rows={3}
          value={draft}
          placeholder="Anything an auditor should know: who approved it, what it replaced."
          onChange={e => setDraft(e.target.value)}
        />
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 28 }}>
        <span className="ja-exp-aside__hint">Included in the audit download.</span>
        {dirty && (
          <Button variant="secondary" size="sm" style={{ marginLeft: 'auto' }} onClick={save}>
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
