import React from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, DataTable, Icon, IconButton } from '../../../../design-system';
import { dateLong, dateRange, money, programName, staffById, useStore } from '../../../../core';
import { awardLetter, funderById, grantFiles } from '../../domain';
import type { AwardTerm, Grant, GrantFile, Payment } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { Eyebrow } from '../../../../app/components/badges';
import { TableScroll } from '../../../../app/components/TableScroll';
import { AddButton, DeleteX, DoneMark, InlineConfirm } from './parts';
import { EditRecordDialog, PaymentDialog, TermDialog } from './AwardDialogs';
import type { PaymentValues } from './AwardDialogs';
import {
  ACCEPTED_FILES,
  downloadFile,
  FileDrop,
  FilePaper,
  FileViewerDialog,
  fileFacts,
  PageTurner,
  useUploadedLine,
} from '../money/files';
import { GRANT_KIND_LABEL, useRemoveGrantFile, useStoreGrantFile } from './awardShared';
import './award.css';

/** The award as the letter states it: the record, the payment schedule, the terms. */

type Viewing = { file: GrantFile; page: number } | null;

/** A section band with a quiet note and an action. */
function Band({
  title,
  note,
  action,
  first = false,
}: {
  title: string;
  note?: React.ReactNode;
  action?: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div className="ja-award-band" style={first ? { borderTop: 0 } : undefined}>
      <h4>{title}</h4>
      {note && <span className="ja-award-band__note">{note}</span>}
      {action && <span className="ja-award-band__action">{action}</span>}
    </div>
  );
}

/** "p. 2", opening the award letter at that page. Plain text when there is no letter to open. */
function PageLink({
  page,
  letter,
  onOpen,
}: {
  page?: number;
  letter?: GrantFile;
  onOpen: (page: number) => void;
}) {
  if (!page)
    return (
      <span className="ja-page-link ja-page-link--none" aria-label="No page noted">
        —
      </span>
    );
  if (!letter) {
    return (
      <span
        className="ja-page-link ja-page-link--none"
        title="Store the award letter to open it at this page"
      >
        p. {page}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="ja-page-link"
      aria-label={`Open the award letter at page ${page}`}
      onClick={e => {
        e.stopPropagation();
        onOpen(page);
      }}
    >
      p. {page}
    </button>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      {children}
    </div>
  );
}

export function AwardTab({ grant }: { grant: Grant }) {
  const { state, today, actions } = useStore();
  const toast = useToast();
  const [editingRecord, setEditingRecord] = React.useState(false);
  const [addingPayment, setAddingPayment] = React.useState(false);
  const [editingPayment, setEditingPayment] = React.useState<Payment | null>(null);
  const [addingTerm, setAddingTerm] = React.useState(false);
  const [editingTerm, setEditingTerm] = React.useState<AwardTerm | null>(null);
  const [confirmingTerm, setConfirmingTerm] = React.useState<string | null>(null);
  const [viewing, setViewing] = React.useState<Viewing>(null);

  const funder = funderById(state, grant.funderId);
  const owner = staffById(state, grant.ownerId);
  const letter = awardLetter(state, grant.id);
  const openLetter = (page: number) => letter && setViewing({ file: letter, page });

  const payments = state.grants.payments
    .filter(p => p.grantId === grant.id)
    .slice()
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate) || a.label.localeCompare(b.label));
  const terms = state.grants.terms
    .filter(t => t.grantId === grant.id)
    .slice()
    .sort((a, b) => a.order - b.order);

  const awarded = grant.amountAwarded;
  const received = payments.reduce((sum, p) => sum + (p.receivedDate ? p.amount : 0), 0);
  const scheduled = payments.reduce((sum, p) => sum + p.amount, 0);
  const receivedNote =
    awarded !== undefined
      ? `${money(received)} of ${money(awarded)} received`
      : payments.length
        ? `${money(received)} of ${money(scheduled)} received`
        : undefined;

  const markReceived = (p: Payment) => {
    actions.grants.markPaymentReceived(p.id, today);
    toast({
      tone: 'success',
      title: 'Payment received',
      message: `${p.label} · ${money(p.amount)} on ${dateLong(today)}`,
    });
  };

  const savePayment = (v: PaymentValues) => {
    if (editingPayment) {
      actions.grants.updatePayment(editingPayment.id, v);
      toast({
        tone: 'success',
        title: 'Payment saved',
        message: `${v.label} · ${money(v.amount)}`,
      });
      setEditingPayment(null);
    } else {
      actions.grants.addPayment({ grantId: grant.id, ...v });
      toast({
        tone: 'success',
        title: 'Payment added',
        message: `${v.label} · ${money(v.amount)} expected ${dateLong(v.expectedDate)}`,
      });
      setAddingPayment(false);
    }
  };

  const status = (p: Payment) => {
    if (p.receivedDate) return <DoneMark>Received {dateLong(p.receivedDate)}</DoneMark>;
    const overdue = p.expectedDate < today;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Badge tone={overdue ? 'danger' : 'neutral'}>{overdue ? 'Overdue' : 'Expected'}</Badge>
        <Button
          variant="secondary"
          size="sm"
          onClick={e => {
            e.stopPropagation();
            markReceived(p);
          }}
        >
          Mark received
        </Button>
      </span>
    );
  };

  return (
    <div className="ja-award">
      <Band
        first
        title="Award record"
        note={letter ? 'As the award letter states it' : undefined}
        action={
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Icon name="pencil" size={14} />}
            onClick={() => setEditingRecord(true)}
          >
            Edit record
          </Button>
        }
      />
      <div className="ja-award-head">
        <div className="ja-award-facts">
          <Fact label="Award amount">
            {awarded !== undefined ? (
              <span className="ja-award-fact__amount">{money(awarded)}</span>
            ) : (
              <span className="ja-award-fact__value" style={{ color: 'var(--text-muted)' }}>
                Not recorded.{' '}
                <button
                  type="button"
                  className="ja-page-link"
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)' }}
                  onClick={() => setEditingRecord(true)}
                >
                  Add it
                </button>
              </span>
            )}
          </Fact>
          <Fact label="Grant period">
            <span className="ja-award-fact__value ja-award-fact__value--mono">
              {dateRange(grant.dates.periodStart, grant.dates.periodEnd)}
            </span>
          </Fact>
          <Fact label="Date awarded">
            <span className="ja-award-fact__value ja-award-fact__value--mono">
              {dateLong(grant.dates.decided)}
            </span>
          </Fact>
          <Fact label="Restriction">
            <span>
              <Badge tone={grant.restriction === 'restricted' ? 'blue' : 'neutral'}>
                {grant.restriction === 'restricted' ? 'Restricted' : 'Unrestricted'}
              </Badge>
            </span>
          </Fact>
          <Fact label="Funder">
            <span className="ja-award-fact__value">
              {funder ? <Link to={`/funders/${funder.id}`}>{funder.name}</Link> : '—'}
            </span>
          </Fact>
          <Fact label="Program">
            <span className="ja-award-fact__value">{programName(state, grant.program)}</span>
          </Fact>
          <Fact label="Owner">
            <span className="ja-award-fact__value">{owner?.name ?? '—'}</span>
          </Fact>
          <Fact label="Contact">
            <span className="ja-award-fact__value" title={funder?.contactEmail}>
              {funder?.contactName ? (
                funder.contactEmail ? (
                  <a href={`mailto:${funder.contactEmail}`}>{funder.contactName}</a>
                ) : (
                  funder.contactName
                )
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>—</span>
              )}
            </span>
          </Fact>
        </div>
      </div>

      <Band
        title="Payment schedule"
        note={receivedNote}
        action={<AddButton label="Add payment" onClick={() => setAddingPayment(true)} />}
      />
      <TableScroll minWidth={620}>
        <DataTable
          columns={[
            {
              key: 'label',
              label: 'Installment',
              strong: true,
              width: '1.2fr',
              render: (r: Payment) => (
                <button
                  type="button"
                  className="ja-text-button"
                  title="Edit this payment"
                  onClick={e => {
                    e.stopPropagation();
                    setEditingPayment(r);
                  }}
                >
                  {r.label}
                </button>
              ),
            },
            {
              key: 'expectedDate',
              label: 'Expected',
              width: '112px',
              mono: true,
              render: (r: Payment) => (
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    color:
                      !r.receivedDate && r.expectedDate < today ? 'var(--danger-500)' : undefined,
                  }}
                >
                  {dateLong(r.expectedDate)}
                </span>
              ),
            },
            {
              key: 'amount',
              label: 'Amount',
              width: '88px',
              mono: true,
              align: 'right',
              render: (r: Payment) => money(r.amount),
            },
            { key: 'status', label: 'Status', width: 'minmax(210px, 1.5fr)', render: status },
            {
              key: 'source',
              label: 'Source',
              width: '52px',
              render: (r: Payment) => (
                <PageLink page={r.sourcePage} letter={letter} onOpen={openLetter} />
              ),
            },
          ]}
          rows={payments}
          onRowClick={(r: Payment) => setEditingPayment(r)}
          emptyLabel="No installments yet. Add each payment the award letter promises, then mark it received when it arrives."
        />
      </TableScroll>
      {payments.length > 0 && awarded !== undefined && scheduled !== awarded && (
        <p
          style={{
            margin: 0,
            padding: 'var(--space-3) var(--space-6)',
            font: 'var(--type-body-sm)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          The schedule adds up to {money(scheduled)}, {money(Math.abs(awarded - scheduled))}{' '}
          {scheduled < awarded ? 'less' : 'more'} than the award.
        </p>
      )}

      <Band
        title="Terms and restrictions"
        note="As written in the award letter, with the page each came from"
        action={<AddButton label="Add term" onClick={() => setAddingTerm(true)} />}
      />
      {terms.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: '0 var(--space-6) var(--space-5)',
            font: 'var(--type-body-sm)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          No terms yet. Add each condition in the award letter, with the page it is on, so the
          budget and the spend-down warnings can point back to it.
        </p>
      ) : (
        <div style={{ borderTop: 'var(--border-width) solid var(--border-subtle)' }}>
          {terms.map(t => (
            <div key={t.id} className="ja-term">
              {confirmingTerm === t.id ? (
                <>
                  <span className="ja-term__label" style={{ alignSelf: 'center' }}>
                    {t.label}
                  </span>
                  <InlineConfirm
                    question="Delete this term?"
                    onCancel={() => setConfirmingTerm(null)}
                    onConfirm={() => {
                      actions.grants.deleteTerm(t.id);
                      toast({ tone: 'info', title: 'Term deleted', message: t.label });
                      setConfirmingTerm(null);
                    }}
                  />
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="ja-term__main"
                    title="Edit this term"
                    onClick={() => setEditingTerm(t)}
                  >
                    <span className="ja-term__label">{t.label}</span>
                    <span className="ja-term__text">{t.text}</span>
                  </button>
                  <span className="ja-term__side">
                    <PageLink page={t.page} letter={letter} onOpen={openLetter} />
                    <DeleteX
                      label={`Delete the term ${t.label}`}
                      onClick={() => setConfirmingTerm(t.id)}
                    />
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {editingRecord && <EditRecordDialog grant={grant} onClose={() => setEditingRecord(false)} />}
      {(addingPayment || editingPayment) && (
        <PaymentDialog
          payment={editingPayment ?? undefined}
          letterPages={letter?.pages}
          onClose={() => {
            setAddingPayment(false);
            setEditingPayment(null);
          }}
          onSave={savePayment}
          onDelete={
            editingPayment
              ? () => {
                  actions.grants.deletePayment(editingPayment.id);
                  toast({
                    tone: 'info',
                    title: 'Payment removed',
                    message: `${editingPayment.label} · ${money(editingPayment.amount)}`,
                  });
                  setEditingPayment(null);
                }
              : undefined
          }
        />
      )}
      {(addingTerm || editingTerm) && (
        <TermDialog
          term={editingTerm ?? undefined}
          letterPages={letter?.pages}
          onClose={() => {
            setAddingTerm(false);
            setEditingTerm(null);
          }}
          onSave={v => {
            if (editingTerm) {
              actions.grants.updateTerm(editingTerm.id, v);
              toast({ tone: 'success', title: 'Term saved', message: v.label });
              setEditingTerm(null);
            } else {
              actions.grants.addTerm({ grantId: grant.id, ...v });
              toast({ tone: 'success', title: 'Term added', message: v.label });
              setAddingTerm(false);
            }
          }}
        />
      )}
      {viewing && (
        <FileViewerDialog
          file={viewing.file}
          startPage={viewing.page}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/** The right-hand column of the Award tab: the award letter, and the other files kept with the grant. */
export function AwardAside({ grant }: { grant: Grant }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const storeFile = useStoreGrantFile();
  const removeFile = useRemoveGrantFile();
  const letter = awardLetter(state, grant.id);
  const others = grantFiles(state, grant.id).filter(f => f.id !== letter?.id);
  const [viewing, setViewing] = React.useState<Viewing>(null);

  const take = (file: File) => {
    const stored = storeFile(grant.id, file, 'award-letter');
    if ('error' in stored) {
      toast({ tone: 'info', title: 'That file was not stored', message: stored.error });
      return;
    }
    if (letter) {
      removeFile(letter);
      actions.grants.addNote(grant.id, `Award letter replaced: ${file.name}`);
      toast({ tone: 'success', title: 'Award letter replaced', message: file.name });
    } else {
      actions.grants.addNote(grant.id, `Award letter stored: ${file.name}`);
      toast({ tone: 'success', title: 'Award letter stored', message: file.name });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
      <Card
        title="Award letter"
        padding="0"
        action={
          letter ? (
            <Badge tone="teal" dot>
              Uploaded
            </Badge>
          ) : (
            <Badge tone="neutral">Not stored</Badge>
          )
        }
      >
        {letter ? (
          <LetterView
            key={letter.id}
            letter={letter}
            onOpen={page => setViewing({ file: letter, page })}
            onReplace={take}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              padding: 'var(--space-5) var(--space-6)',
            }}
          >
            <FileDrop
              multiple={false}
              onFiles={files => files[0] && take(files[0])}
              title={
                <>
                  Drop the award letter here or{' '}
                  <span style={{ color: 'var(--text-link)' }}>choose it</span>
                </>
              }
              hint="PDF, JPG, PNG or HEIC, up to 20 MB"
            />
            <p
              style={{
                margin: 0,
                font: 'var(--type-body-sm)',
                fontSize: 'var(--text-xs)',
                lineHeight: 1.55,
                color: 'var(--text-muted)',
              }}
            >
              The letter is the source for the payment schedule and the terms. Once it is here, each
              page link on the Award tab opens it at that page.
            </p>
          </div>
        )}

        {others.map(f => (
          <OtherFile key={f.id} file={f} onOpen={() => setViewing({ file: f, page: 1 })} />
        ))}

        <div className="ja-letter-foot">
          <Icon
            name="link"
            size={15}
            color="var(--teal-500)"
            style={{ flex: '0 0 auto', marginTop: 2 }}
          />
          <span>These terms feed the budget and the spend-down warnings.</span>
        </div>
      </Card>

      {viewing && (
        <FileViewerDialog
          file={viewing.file}
          startPage={viewing.page}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/** The stored letter: its first page on a stage that turns, what it is, and Open, Download, Replace. */
function LetterView({
  letter,
  onOpen,
  onReplace,
}: {
  letter: GrantFile;
  onOpen: (page: number) => void;
  onReplace: (file: File) => void;
}) {
  const [page, setPage] = React.useState(1);
  const input = React.useRef<HTMLInputElement | null>(null);
  const uploaded = useUploadedLine(letter);
  const pages = letter.pages ?? 1;
  const shown = Math.min(page, pages);

  return (
    <div className="ja-letter">
      <div className="ja-letter-stage">
        <button
          type="button"
          className="ja-letter-stage__paper"
          aria-label={`Open ${letter.name} at page ${shown}`}
          onClick={() => onOpen(shown)}
        >
          <FilePaper file={letter} page={shown} />
        </button>
        {pages > 1 ? (
          <PageTurner page={shown} pages={pages} onChange={setPage} />
        ) : (
          <span style={{ height: 4 }} />
        )}
      </div>
      <div
        style={{
          padding: 'var(--space-4) var(--space-6) 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span className="ja-file-name">{letter.name}</span>
        <span className="ja-file-meta">{fileFacts(letter)}</span>
        <span className="ja-file-meta">{uploaded}</span>
      </div>
      <div className="ja-letter-actions">
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="external-link" size={14} />}
          onClick={() => onOpen(shown)}
        >
          Open
        </Button>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="download" size={14} />}
          onClick={() => downloadFile(letter)}
        >
          Download
        </Button>
        <span className="ja-letter-actions__replace">
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Icon name="refresh-cw" size={14} />}
            onClick={() => input.current?.click()}
          >
            Replace
          </Button>
        </span>
        <input
          ref={input}
          type="file"
          hidden
          accept={ACCEPTED_FILES}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onReplace(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

/** Another file kept with the grant, such as the signed agreement. */
function OtherFile({ file, onOpen }: { file: GrantFile; onOpen: () => void }) {
  const uploaded = useUploadedLine(file);
  return (
    <div className="ja-file-row">
      <div className="ja-file-row__text">
        <div className="ja-file-name" style={{ fontSize: 'var(--text-xs)' }} title={file.name}>
          {file.name}
        </div>
        <div className="ja-file-meta" style={{ fontSize: 'var(--text-2xs)' }}>
          {GRANT_KIND_LABEL[file.kind]} · {fileFacts(file)}
        </div>
        <div className="ja-file-meta" style={{ fontSize: 'var(--text-2xs)' }}>
          {uploaded}
        </div>
      </div>
      <div className="ja-file-row__buttons">
        <IconButton label={`Open ${file.name}`} size="sm" variant="outline" onClick={onOpen}>
          <Icon name="external-link" size={14} />
        </IconButton>
        <IconButton
          label={`Download ${file.name}`}
          size="sm"
          variant="outline"
          onClick={() => downloadFile(file)}
        >
          <Icon name="download" size={14} />
        </IconButton>
      </div>
    </div>
  );
}
