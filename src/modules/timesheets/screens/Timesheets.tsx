import React from 'react';
import { addWeeks, format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  Icon,
  IconButton,
  ProgressBar,
  Select,
  StatCard,
  Textarea,
} from '../../../design-system';
import { usePageHeader } from '../../../app/Shell';
import { useToast } from '../../../app/ToastHost';
import { OUTLINED_GOLD_BADGE, OwnerAvatar } from '../../../app/components/badges';
import { RowMenu } from '../../../app/components/RowMenu';
import type { RowMenuItem } from '../../../app/components/RowMenu';
import { TableScroll } from '../../../app/components/TableScroll';
import {
  activeOnly,
  dateRange,
  dateShort,
  inSchoolProgramIds,
  isInSchool,
  programById,
  programName,
  staffById,
  toDate,
  toISO,
  useCan,
  useStore,
} from '../../../core';
import {
  entriesForWeek,
  formatHours,
  hoursByProgram,
  hoursForPrograms,
  hoursThisMonth,
  isSentBack,
  mayApprove,
  mayChangeEntry,
  mayDeleteEntry,
  mayReadHistory,
  mayRecall,
  maySendBack,
  monthLabel,
  monthRange,
  ownDrafts,
  sentBackTo,
  teachersThisMonth,
  visibleEntries,
  weekFromParam,
  weekRange,
  weekStart,
  weekTotals,
} from '../domain';
import type { TimeEntry, TimeEntryStatus } from '../domain';
import HistoryDialog from './HistoryDialog';
import LogHoursDialog from './LogHoursDialog';
import { SentBackNote } from './SentBack';
import './timesheets.css';

type StatusLook = { label: string; tone: 'neutral' | 'gold' | 'teal'; style?: React.CSSProperties };

/** Draft is nobody's problem yet, submitted is the office's, approved is done. */
const STATUS: Record<TimeEntryStatus, StatusLook> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'gold' },
  approved: { label: 'Approved', tone: 'teal' },
};

/**
 * A draft the office sent back is its person's to fix, so it says so in outlined
 * gold, as its dashboard row does: it needs their attention, it is not an error,
 * and it reads apart from the filled gold Submitted (#96).
 */
const SENT_BACK: StatusLook = { label: 'Sent back', tone: 'gold', style: OUTLINED_GOLD_BADGE };

function statusOf(entry: TimeEntry): StatusLook {
  return isSentBack(entry) ? SENT_BACK : STATUS[entry.status];
}

/** "Mon Sep 7", the day column and every message that names one entry. */
function day(entry: TimeEntry): string {
  return format(toDate(entry.date), 'EEE MMM d');
}

/**
 * In-school hours are the ones a grant report asks for, so they keep the teal
 * they carry in the stat row. Every other program shares the lead blue: the
 * bars compare one measure, and the name tells them apart.
 */
function barColor(inSchool: boolean): string {
  return inSchool ? 'var(--teal-500)' : 'var(--blue-500)';
}

export default function Timesheets() {
  const { state, today, actions, user } = useStore();
  const allowed = useCan();
  const toast = useToast();
  // A role that approves sees everyone's hours; anyone else sees their own (decision 0001).
  const seesEveryone = allowed('timesheets-approve', 'edit');
  const mayLog = allowed('timesheets-log', 'edit', true);

  // A link may name the week to open (`?week=`), as the dashboard's sent-back row does.
  const [params] = useSearchParams();
  const [monday, setMonday] = React.useState(
    () => weekFromParam(params.get('week')) ?? weekStart(today),
  );
  const [teacher, setTeacher] = React.useState('all');
  const [logging, setLogging] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [deleting, setDeleting] = React.useState<TimeEntry | null>(null);
  const [editing, setEditing] = React.useState<TimeEntry | null>(null);
  const [sendingBack, setSendingBack] = React.useState<TimeEntry | null>(null);
  const [reason, setReason] = React.useState('');
  // The entry whose history is open, by id, so the dialog follows the live entry.
  const [historyOf, setHistoryOf] = React.useState<string | null>(null);
  const historyEntry = historyOf
    ? state.timesheets.entries.find(e => e.id === historyOf)
    : undefined;

  const thisMonday = weekStart(today);
  const shiftWeeks = (by: number) => setMonday(toISO(addWeeks(toDate(monday), by)));

  // The stat row summarises today's week and this month; the card below follows
  // whichever week is on screen.
  // Someone who sees only their own hours gets totals of their own hours too.
  const scoped = seesEveryone
    ? state
    : {
        ...state,
        timesheets: {
          ...state.timesheets,
          entries: visibleEntries(user, state.timesheets.entries),
        },
      };
  const thisWeek = weekTotals(scoped, thisMonday);
  const month = monthRange(today);
  const monthHours = hoursThisMonth(scoped, today);
  const teachers = teachersThisMonth(scoped, today);
  const inSchool = hoursForPrograms(scoped, inSchoolProgramIds(state), month.from, month.to);
  // The current teaching artists. Someone archived keeps their hours (they still
  // count below) and stays in the teacher filter for a week they logged in.
  const teachingStaff = activeOnly(state.core.staff).filter(s => s.teaches);

  usePageHeader({
    title: 'Timesheets',
    subtitle: `${monthLabel(today)} · ${teachingStaff.length} teaching artists`,
  });

  const week = weekRange(monday);
  const weekEntries = visibleEntries(user, entriesForWeek(state, monday));
  const shown = weekEntries.filter(
    e => !seesEveryone || teacher === 'all' || e.staffId === teacher,
  );
  const shownHours = shown.reduce((sum, e) => sum + e.hours, 0);
  // Submit week hands over the signed-in person's own drafts only, whoever else
  // is on screen; once submitted they are the office's to approve.
  // When the teacher filter shows somebody else, the button is left out too, so
  // it never sits beside rows it would not submit.
  const filteredToOthers = seesEveryone && teacher !== 'all' && teacher !== user.id;
  const myDrafts =
    mayLog && !filteredToOthers ? ownDrafts(user, entriesForWeek(state, monday)) : [];
  const myDraftHours = myDrafts.reduce((sum, e) => sum + e.hours, 0);
  const oneDraft = myDrafts.length === 1;
  const submitMessage = `Your ${myDrafts.length} draft ${oneDraft ? 'entry' : 'entries'}, ${formatHours(myDraftHours)} hours, ${oneDraft ? 'goes' : 'go'} to the office for approval. You can recall ${oneDraft ? 'it' : 'them'} until the office approves ${oneDraft ? 'it' : 'them'}.`;

  const submitWeek = () => {
    const sent = actions.timesheets.submitWeek(monday);
    setSubmitting(false);
    if (!sent) return;
    toast({
      tone: 'success',
      title: 'Hours submitted',
      message: `${sent} ${sent === 1 ? 'entry' : 'entries'} · ${formatHours(myDraftHours)} hrs`,
    });
  };

  const approve = (entry: TimeEntry) => {
    actions.timesheets.approveEntry(entry.id);
    toast({
      tone: 'success',
      title: 'Hours approved',
      message: `${staffById(state, entry.staffId)?.name ?? 'Teacher'} · ${formatHours(entry.hours)} hrs`,
    });
  };

  // Recalling is undone by submitting again, so it asks nothing first.
  const recall = (entry: TimeEntry) => {
    actions.timesheets.recallEntry(entry.id);
    toast({
      tone: 'success',
      title: 'Hours recalled',
      message: `${formatHours(entry.hours)} hrs back in your drafts`,
    });
  };

  const deleteDraft = (entry: TimeEntry) => {
    actions.timesheets.deleteEntry(entry.id);
    setDeleting(null);
    toast({
      tone: 'success',
      title: 'Draft deleted',
      message: `${day(entry)} · ${formatHours(entry.hours)} hrs`,
    });
  };

  const openSendBack = (entry: TimeEntry) => {
    setReason('');
    setSendingBack(entry);
  };

  const sendBack = (entry: TimeEntry) => {
    if (!reason.trim()) return;
    actions.timesheets.sendBackEntry(entry.id, reason);
    setSendingBack(null);
    toast({
      tone: 'success',
      title: 'Hours sent back',
      message: `${staffById(state, entry.staffId)?.name ?? 'Teacher'} · ${formatHours(entry.hours)} hrs back in their drafts`,
    });
  };

  // The person's own hours the office sent back, whichever week they are in.
  const returned = mayLog ? sentBackTo(state, user) : [];
  const sendingBackName = sendingBack
    ? (staffById(state, sendingBack.staffId)?.name ?? 'the teacher')
    : '';

  // The control a row shows directly: Edit and Delete draft on your own draft,
  // Recall on your own submitted entry, Approve on somebody else's.
  const direct = (r: TimeEntry): React.ReactNode =>
    mayDeleteEntry(user, r) ? (
      <>
        {mayChangeEntry(user, r) && (
          <IconButton label="Edit hours" size="sm" onClick={() => setEditing(r)}>
            <Icon name="pencil" size={15} />
          </IconButton>
        )}
        <IconButton label="Delete draft" size="sm" onClick={() => setDeleting(r)}>
          <Icon name="trash-2" size={15} />
        </IconButton>
      </>
    ) : mayRecall(user, r) ? (
      <Button size="sm" variant="ghost" onClick={() => recall(r)}>
        Recall
      </Button>
    ) : r.status === 'submitted' && mayApprove(user, r) ? (
      <Button size="sm" variant="ghost" onClick={() => approve(r)}>
        Approve
      </Button>
    ) : null;

  // What a row keeps in its "…" menu: sending approved hours back, which is rare,
  // and the history, which the status opens as well.
  const more = (r: TimeEntry): RowMenuItem[] => [
    ...(maySendBack(user, r)
      ? [{ label: 'Send back', icon: 'undo-2', onSelect: () => openSendBack(r) }]
      : []),
    ...(mayReadHistory(user, r)
      ? [{ label: 'History', icon: 'history', onSelect: () => setHistoryOf(r.id) }]
      : []),
  ];

  const programHours = hoursByProgram(scoped, month);
  const biggest = programHours[0]?.hours ?? 0;

  const logButton = mayLog ? (
    <Button
      variant="primary"
      size="sm"
      iconLeft={<Icon name="plus" size={15} />}
      onClick={() => setLogging(true)}
    >
      Log hours
    </Button>
  ) : undefined;

  return (
    <>
      <div className="ja-grid-stats">
        <StatCard
          label="Hours this week"
          value={formatHours(thisWeek.hours)}
          accent="var(--olive-500)"
          footnote={`${thisWeek.entries} ${thisWeek.entries === 1 ? 'entry' : 'entries'}`}
        />
        <StatCard
          label="Awaiting approval"
          value={String(thisWeek.awaiting)}
          accent="var(--gold-400)"
          footnote={`${formatHours(thisWeek.awaitingHours)} hrs`}
        />
        <StatCard
          label="This month"
          value={formatHours(monthHours)}
          unit="hrs"
          accent="var(--blue-500)"
          footnote={`Across ${teachers} ${teachers === 1 ? 'teacher' : 'teachers'}`}
        />
        <StatCard
          label="In-school hours"
          value={formatHours(inSchool)}
          unit="hrs"
          accent="var(--teal-500)"
          footnote="Grant-reportable"
        />
      </div>

      {returned.length > 0 && (
        <div className="ja-ts-returned" role="status">
          <div className="ja-ts-returned__title">
            {returned.length === 1
              ? 'The office sent back 1 entry for you to fix'
              : `The office sent back ${returned.length} entries for you to fix`}
          </div>
          {returned.map(entry => (
            <div key={entry.id} className="ja-ts-returned__item">
              <div>
                <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-body)' }}>
                  {day(entry)}, {entry.activity}, {formatHours(entry.hours)} hours
                </div>
                <SentBackNote entry={entry} />
              </div>
              {weekStart(entry.date) !== monday && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setTeacher('all');
                    setMonday(weekStart(entry.date));
                  }}
                >
                  Show week
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                iconLeft={<Icon name="pencil" size={15} />}
                onClick={() => setEditing(entry)}
              >
                Edit hours
              </Button>
            </div>
          ))}
        </div>
      )}

      <Card
        padding="0"
        title={`Week of ${dateShort(week.from)}`}
        subtitle={`${dateRange(week.from, week.to)} · ${shown.length} ${shown.length === 1 ? 'entry' : 'entries'} · ${formatHours(shownHours)} hours`}
        action={
          <div className="ja-ts-controls">
            <div className="ja-ts-weeknav">
              <IconButton
                label="Previous week"
                size="sm"
                variant="outline"
                onClick={() => shiftWeeks(-1)}
              >
                <Icon name="chevron-left" size={16} />
              </IconButton>
              <Button
                size="sm"
                variant="secondary"
                disabled={monday === thisMonday}
                onClick={() => setMonday(thisMonday)}
              >
                Today
              </Button>
              <IconButton
                label="Next week"
                size="sm"
                variant="outline"
                onClick={() => shiftWeeks(1)}
              >
                <Icon name="chevron-right" size={16} />
              </IconButton>
            </div>
            {seesEveryone && (
              <div className="ja-ts-teacher">
                <Select
                  value={teacher}
                  onChange={e => setTeacher(e.target.value)}
                  options={[
                    { value: 'all', label: 'All teachers' },
                    ...state.core.staff
                      .filter(
                        s =>
                          s.teaches &&
                          (teachingStaff.includes(s) ||
                            s.id === teacher ||
                            weekEntries.some(e => e.staffId === s.id)),
                      )
                      .map(s => ({ value: s.id, label: s.name })),
                  ]}
                  style={{ width: '100%' }}
                />
              </div>
            )}
            {myDrafts.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Icon name="send" size={15} />}
                onClick={() => setSubmitting(true)}
              >
                Submit week
              </Button>
            )}
            {logButton}
          </div>
        }
      >
        {shown.length === 0 ? (
          <EmptyState
            icon={<Icon name="clock" size={22} />}
            title="Nothing logged yet"
            message={
              !seesEveryone
                ? 'You have no hours logged for this week yet.'
                : teacher === 'all'
                  ? 'No hours logged for this week yet. Log hours to add the first entry.'
                  : `${staffById(state, teacher)?.name ?? 'This teacher'} logged no hours this week.`
            }
            action={logButton}
          />
        ) : (
          <TableScroll minWidth={940}>
            <DataTable
              rows={shown}
              columns={[
                {
                  key: 'day',
                  label: 'Day',
                  width: '110px',
                  mono: true,
                  render: (r: TimeEntry) => day(r),
                },
                {
                  key: 'teacher',
                  label: 'Teacher',
                  width: '1.3fr',
                  strong: true,
                  render: (r: TimeEntry) => (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        minWidth: 0,
                      }}
                    >
                      <OwnerAvatar staffId={r.staffId} size={24} />
                      <span
                        style={{
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {staffById(state, r.staffId)?.name ?? 'Unknown'}
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'activity',
                  label: 'Activity',
                  width: '1.8fr',
                  wrap: true,
                  // A sent-back entry says who sent it back and why, until it is submitted again.
                  render: (r: TimeEntry) => (
                    <>
                      <span>{r.activity}</span>
                      <SentBackNote entry={r} />
                    </>
                  ),
                },
                {
                  key: 'program',
                  label: 'Program',
                  width: '1.1fr',
                  render: (r: TimeEntry) => {
                    const name = programName(state, r.programId);
                    return (
                      <span title={name} style={{ color: 'var(--text-muted)' }}>
                        {programById(state, r.programId)?.short ?? name}
                      </span>
                    );
                  },
                },
                {
                  key: 'hours',
                  label: 'Hours',
                  width: '80px',
                  mono: true,
                  align: 'right',
                  render: (r: TimeEntry) => formatHours(r.hours),
                },
                {
                  key: 'status',
                  label: 'Status',
                  width: '136px',
                  // The status opens the entry's history: every step, who and when (#95).
                  render: (r: TimeEntry) =>
                    mayReadHistory(user, r) ? (
                      <button
                        type="button"
                        className="ja-ts-status"
                        aria-haspopup="dialog"
                        aria-label={`${statusOf(r).label}, show history`}
                        title="Show history"
                        onClick={() => setHistoryOf(r.id)}
                      >
                        <Badge tone={statusOf(r).tone} style={statusOf(r).style} dot>
                          {statusOf(r).label}
                        </Badge>
                        <Icon name="history" size={13} />
                      </button>
                    ) : (
                      <Badge tone={statusOf(r).tone} style={statusOf(r).style} dot>
                        {statusOf(r).label}
                      </Badge>
                    ),
                },
                {
                  key: 'actions',
                  label: '',
                  width: '136px',
                  align: 'right',
                  // Your own draft you may edit and delete, your own submitted entry
                  // you may recall, and somebody else's submitted entry the office
                  // approves: those sit on the row. The rarer ones go in the row's
                  // menu: the history, and sending somebody else's approved entry
                  // back (#96). Nobody approves or sends back their own hours, so
                  // neither is there on them.
                  render: (r: TimeEntry) => (
                    <span className="ja-ts-actions">
                      {direct(r)}
                      {more(r).length > 0 && (
                        <RowMenu label="More for these hours" items={more(r)} />
                      )}
                    </span>
                  ),
                },
              ]}
            />
          </TableScroll>
        )}
      </Card>

      <Card
        title="Hours by program"
        subtitle={`${monthLabel(today)} so far · ${formatHours(monthHours)} hours in all`}
        padding="var(--space-5) var(--space-6)"
      >
        {programHours.length === 0 ? (
          <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
            No hours logged this month yet. They appear here as teachers log them.
          </p>
        ) : (
          <div className="ja-ts-programs">
            {programHours.map(({ programId, hours }) => (
              <div key={programId} className="ja-ts-program">
                <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-body)' }}>
                  {programName(state, programId)}
                </span>
                <div className="ja-ts-program__bar">
                  <ProgressBar
                    value={hours}
                    max={Math.max(biggest, 0.25)}
                    color={barColor(isInSchool(state, programId))}
                  />
                </div>
                <span
                  style={{
                    font: 'var(--type-numeric)',
                    color: 'var(--text-strong)',
                    textAlign: 'right',
                  }}
                >
                  {formatHours(hours)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {submitting && myDrafts.length > 0 && (
        <Dialog
          open
          width={460}
          title={`Submit the week of ${dateShort(week.from)}`}
          description={submitMessage}
          onClose={() => setSubmitting(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setSubmitting(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                iconLeft={<Icon name="send" size={15} />}
                onClick={submitWeek}
              >
                Submit hours
              </Button>
            </>
          }
        />
      )}

      {deleting && (
        <Dialog
          open
          width={460}
          title="Delete this draft?"
          description={`${day(deleting)}, ${deleting.activity}, ${formatHours(deleting.hours)} hours. This can't be undone.`}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                iconLeft={<Icon name="trash-2" size={15} />}
                onClick={() => deleteDraft(deleting)}
              >
                Delete draft
              </Button>
            </>
          }
        />
      )}

      {sendingBack && (
        <Dialog
          open
          width={480}
          title="Send these hours back?"
          description={`${day(sendingBack)}, ${sendingBackName}, ${sendingBack.activity}, ${formatHours(sendingBack.hours)} hours. They go back to ${sendingBackName} as a draft to fix and submit again, and are no longer approved.`}
          onClose={() => setSendingBack(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setSendingBack(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                iconLeft={<Icon name="undo-2" size={15} />}
                disabled={!reason.trim()}
                onClick={() => sendBack(sendingBack)}
              >
                Send back
              </Button>
            </>
          }
        >
          <Field
            label="What needs fixing"
            required
            hint={`${sendingBackName} sees this on the entry until it is submitted again.`}
          >
            <Textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="A sentence is enough."
            />
          </Field>
        </Dialog>
      )}

      {historyEntry && <HistoryDialog entry={historyEntry} onClose={() => setHistoryOf(null)} />}

      {editing && (
        <LogHoursDialog
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={({ hours }) => {
            toast({
              tone: 'success',
              title: 'Hours changed',
              message: `${day(editing)} · ${formatHours(hours)} hrs, still a draft`,
            });
            setEditing(null);
          }}
        />
      )}

      {logging && (
        <LogHoursDialog
          onClose={() => setLogging(false)}
          onSaved={({ staffId, hours }) => {
            toast({
              tone: 'success',
              title: 'Hours logged',
              message: `${staffById(state, staffId)?.name ?? 'Teacher'} · ${formatHours(hours)} hrs`,
            });
            setLogging(false);
          }}
        />
      )}
    </>
  );
}
