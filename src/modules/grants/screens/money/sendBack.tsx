import React from 'react';
import { Button, Dialog } from '../../../../design-system';
import { money, useStore } from '../../../../core';
import { useToast } from '../../../../app/ToastHost';
import { transactionById, transactionSnapshot } from '../../domain';
import type { Transaction, TransactionSnapshot } from '../../domain';
import { joinWords } from './transactionHelpers';
import './shared.css';

/**
 * Send back and Undo, shared by Transactions and a grant's Expenses tab: one
 * confirm, one toast, one Undo that puts the transaction back exactly.
 */

/** "Undo" inside a toast. It works once, then says so. */
function UndoButton({ onUndo }: { onUndo: () => void }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      className="ja-undo"
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
 * Change some transactions and say so in a toast with Undo. The Undo puts them
 * back as `transactionSnapshot` found them just before: status, parts, notes and files.
 */
export function useTransactionUndo() {
  const { state, actions } = useStore();
  const toast = useToast();
  return (ids: string[], run: () => void, title: string, message: string) => {
    const before = ids
      .map(id => transactionSnapshot(state, id))
      .filter((snap): snap is TransactionSnapshot => !!snap);
    run();
    toast({
      title,
      message: (
        <span>
          {message}{' '}
          <UndoButton
            onUndo={() => {
              actions.grants.restoreTransactions(before);
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
}

/** True when sending the transaction back would delete backup files or a backup note. */
function hasBackup(snap: TransactionSnapshot): boolean {
  return snap.files.length > 0 || snap.expenses.some(e => e.backupNote?.trim());
}

/**
 * Send a transaction back to the To assign tab. When that would delete backup
 * it asks first; either way the toast offers Undo. Render `dialog` somewhere on
 * the page and call `sendBack(tx)` from the button or menu.
 *
 * `away` is for a screen other than Transactions, so the copy says where the
 * transaction goes. `onSent` runs once it has gone.
 */
export function useSendBack({
  away = false,
  onSent,
}: { away?: boolean; onSent?: (tx: Transaction) => void } = {}) {
  const { state, actions } = useStore();
  const withUndo = useTransactionUndo();
  /** A send-back waiting on its confirm, because it would delete backup. */
  const [pending, setPending] = React.useState<TransactionSnapshot | undefined>();
  const place = away ? 'the To assign tab on Transactions' : 'the To assign tab';

  const run = (tx: Transaction, backup: boolean) => {
    withUndo(
      [tx.id],
      () => actions.grants.unassignTransaction(tx.id),
      'Sent back to assign',
      `${tx.payee}, ${money(tx.amount)} is waiting on ${place} again.${backup ? ' Its backup was removed.' : ''}`,
    );
    onSent?.(tx);
  };

  const sendBack = (tx: Transaction) => {
    const snap = transactionSnapshot(state, tx.id);
    if (snap && hasBackup(snap)) setPending(snap);
    else run(tx, false);
  };

  const pendingTx = pending && transactionById(state, pending.id);
  const dialog = pendingTx && pending && (
    <SendBackDialog
      tx={pendingTx}
      snap={pending}
      place={place}
      onCancel={() => setPending(undefined)}
      onConfirm={() => {
        setPending(undefined);
        run(pendingTx, true);
      }}
    />
  );

  return { sendBack, dialog };
}

/** "Send back" when it would delete backup: say what goes before it goes. */
function SendBackDialog({
  tx,
  snap,
  place,
  onCancel,
  onConfirm,
}: {
  tx: Transaction;
  snap: TransactionSnapshot;
  place: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const parts = snap.expenses.length;
  const files = snap.files.length;
  const notes = snap.expenses.filter(e => e.backupNote?.trim()).length;
  const what = [
    files ? (files === 1 ? 'its backup file' : `its ${files} backup files`) : '',
    notes ? (notes === 1 ? 'its backup note' : `its ${notes} backup notes`) : '',
  ].filter(Boolean);
  return (
    <Dialog
      open
      title="Send back to assign?"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Keep it
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Send back
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        This takes {parts > 1 ? `all ${parts} parts of ${tx.ref}` : 'the expense'} from {tx.payee}{' '}
        off the budget and deletes {joinWords(what)}. The transaction goes back to {place}.
        QuickBooks is not changed.
      </p>
    </Dialog>
  );
}
