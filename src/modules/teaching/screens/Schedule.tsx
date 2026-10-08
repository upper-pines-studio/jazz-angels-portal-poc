import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { addDays, addWeeks, format } from 'date-fns';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  IconButton,
  Tabs,
} from '../../../design-system';
import { usePageHeader } from '../../../app/Shell';
import { OwnerAvatar } from '../../../app/components/badges';
import { TableScroll } from '../../../app/components/TableScroll';
import { useToast } from '../../../app/ToastHost';
import {
  ArchiveDialog,
  ArchivedName,
  ShowArchivedSwitch,
  useArchivedParam,
} from '../../../app/components/archive';
import {
  activeOnly,
  archivedOnly,
  dateRange,
  dateShort,
  isArchived,
  placeLabel,
  programById,
  programName,
  staffById,
  toDate,
  toISO,
  useCan,
  useStore,
} from '../../../core';
import {
  ensembleById,
  ensembleCount,
  ensemblesList,
  isScheduled,
  mayTakeRoll,
  meetingsForWeek,
  termForDate,
  termWeek,
  termsList,
  timeLabel,
  timeRange,
  weekStart,
} from '../domain';
import type { ClassMeeting, Ensemble, Term } from '../domain';
import { RollBadge, TONE_COLOR } from './parts';
import AddClassDialog from './schedule/AddClassDialog';
import EnsembleDialog from './schedule/EnsembleDialog';
import TermDialog from './schedule/TermDialog';
import './schedule.css';

/** Which add or edit dialog is open: `new` for Add, a record for Edit. */
type Editing<T> = T | 'new' | null;

/** The ghost "Add …" button along the foot of a list card, as on Settings' staff list. */
function CardFootAdd({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: 44,
        padding: '0 var(--space-4)',
        background: 'var(--surface-sunken)',
        borderTop: 'var(--border-width) solid var(--border-subtle)',
      }}
    >
      <Button variant="ghost" size="sm" iconLeft={<Icon name="plus" size={15} />} onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}

/** Edit · Archive on a current row, Restore on an archived one. The row's own click is left alone. */
function RowActions({
  archived,
  onEdit,
  onArchive,
  onRestore,
}: {
  archived: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const link = (label: string, run: () => void) => (
    <a
      href="#"
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        run();
      }}
    >
      {label}
    </a>
  );
  if (archived) return link('Restore', onRestore);
  return (
    <span className="ja-actions" style={{ justifyContent: 'flex-end' }}>
      {link('Edit', onEdit)}
      {link('Archive', onArchive)}
    </span>
  );
}

/** Sunday through Thursday: the five days Jazz Angels teaches on. */
const DAYS = [0, 1, 2, 3, 4];

export default function Schedule() {
  const { state, today } = useStore();
  // An archived ensemble cannot have a class added, so only the current ones count.
  const ensembles = activeOnly(state.teaching.ensembles).length;
  // Sessions and ensembles are the schedule itself: "Schedule and classes: Edit".
  const mayEdit = useCan()('schedule', 'edit');
  // A class belongs to an ensemble, so with none there is nothing to add a class to.
  const mayAdd = mayEdit && ensembles > 0;
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'term' ? 'term' : 'week';

  const [start, setStart] = React.useState(() => weekStart(today));
  const [adding, setAdding] = React.useState(false);
  const [term, setTerm] = React.useState<Editing<Term>>(null);
  const [ensemble, setEnsemble] = React.useState<Editing<Ensemble>>(null);

  const current = termForDate(state, today);
  const week = termWeek(current, today);

  usePageHeader({
    title: 'Schedule',
    subtitle: [
      current && `${current.name}${week ? ` · week ${week} of ${current.meetingsPlanned}` : ''}`,
      ensembles === 0
        ? 'No ensembles yet'
        : `${ensembles} ${ensembles === 1 ? 'ensemble' : 'ensembles'}`,
    ]
      .filter(Boolean)
      .join(' · '),
    // Add class once there is an ensemble to put a class in; before that, the ensemble.
    actions: mayAdd ? (
      <Button
        variant="primary"
        size="sm"
        iconLeft={<Icon name="plus" size={15} />}
        onClick={() => setAdding(true)}
      >
        Add class
      </Button>
    ) : mayEdit ? (
      <Button
        variant="primary"
        size="sm"
        iconLeft={<Icon name="plus" size={15} />}
        onClick={() => setEnsemble('new')}
      >
        Add ensemble
      </Button>
    ) : undefined,
  });

  const setView = (next: string) => {
    const q = new URLSearchParams(params);
    q.set('view', next);
    setParams(q, { replace: true });
  };

  return (
    <>
      <div className="ja-tabs-scroll">
        <Tabs
          tabs={[
            { id: 'week', label: 'Week' },
            { id: 'term', label: 'Term' },
          ]}
          active={view}
          onChange={setView}
          style={{ borderBottom: 0 }}
        />
      </div>

      {view === 'week' ? (
        <WeekGrid
          start={start}
          onStart={setStart}
          onAdd={mayAdd ? () => setAdding(true) : undefined}
          onAddEnsemble={mayEdit ? () => setEnsemble('new') : undefined}
        />
      ) : (
        <TermView
          onEditTerm={mayEdit ? next => setTerm(next ?? 'new') : undefined}
          onEditEnsemble={mayEdit ? next => setEnsemble(next ?? 'new') : undefined}
        />
      )}

      {adding && mayAdd && (
        <AddClassDialog
          open
          onClose={() => setAdding(false)}
          defaultDate={view === 'week' ? start : today}
        />
      )}
      {term && mayEdit && (
        <TermDialog term={term === 'new' ? undefined : term} onClose={() => setTerm(null)} />
      )}
      {ensemble && mayEdit && (
        <EnsembleDialog
          ensemble={ensemble === 'new' ? undefined : ensemble}
          onClose={() => setEnsemble(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Week
// ---------------------------------------------------------------------------

function WeekGrid({
  start,
  onStart,
  onAdd,
  onAddEnsemble,
}: {
  start: string;
  onStart: (iso: string) => void;
  /** Unset for a role that may not add a class, or while there is no ensemble. */
  onAdd?: () => void;
  /** Unset for a role that may not add an ensemble. */
  onAddEnsemble?: () => void;
}) {
  const nav = useNavigate();
  const { state, today, user } = useStore();

  const meetings = meetingsForWeek(state, start);
  const end = toISO(addDays(toDate(start), 6));
  const term = termForDate(state, start);
  const week = termWeek(term, start);

  // Rows are the hours this week actually uses, so an empty hour never shows.
  const slots = [...new Set(meetings.map(m => m.start))].sort();
  const shift = (weeks: number) => onStart(toISO(addWeeks(toDate(start), weeks)));

  const dayISO = (day: number) => toISO(addDays(toDate(start), day));
  const at = (day: number, slot: string) =>
    meetings.find(m => m.date === dayISO(day) && m.start === slot);

  return (
    <Card padding="0">
      <div
        className="ja-filter-bar"
        style={{
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: 'var(--border-width) solid var(--border-subtle)',
        }}
      >
        <div className="ja-actions">
          <IconButton label="Previous week" variant="outline" onClick={() => shift(-1)}>
            <Icon name="chevron-left" size={16} />
          </IconButton>
          <IconButton label="Next week" variant="outline" onClick={() => shift(1)}>
            <Icon name="chevron-right" size={16} />
          </IconButton>
          <Button variant="secondary" size="sm" onClick={() => onStart(weekStart(today))}>
            Today
          </Button>
        </div>
        <div
          style={{
            font: 'var(--weight-semibold) var(--text-base)/1.2 var(--font-display)',
            letterSpacing: 'var(--tracking-display)',
            color: 'var(--text-strong)',
          }}
        >
          {dateRange(start, end)}
        </div>
        {term && week && <Badge tone="blue">{`${term.name} · week ${week}`}</Badge>}
      </div>

      {slots.length === 0 && activeOnly(state.teaching.ensembles).length === 0 ? (
        <EmptyState
          icon={<Icon name="calendar" size={22} />}
          title="No ensembles yet"
          message={
            onAddEnsemble
              ? "Each ensemble's classes show up here as a week grid, with the roll call for each one. Add an ensemble, then put its classes on the schedule with Add class."
              : "Each ensemble's classes show up here as a week grid, with the roll call for each one, once the office adds them."
          }
          action={
            onAddEnsemble ? (
              <Button variant="secondary" size="sm" onClick={onAddEnsemble}>
                Add ensemble
              </Button>
            ) : undefined
          }
        />
      ) : slots.length === 0 ? (
        <EmptyState
          icon={<Icon name="calendar" size={22} />}
          title="No classes this week"
          message={
            onAdd
              ? 'Classes for the week show up here as a grid. Add a class to put one on the schedule.'
              : 'Classes for the week show up here as a grid.'
          }
          action={
            onAdd ? (
              <Button variant="secondary" size="sm" onClick={onAdd}>
                Add class
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableScroll minWidth={880}>
          <div className="ja-week">
            <div className="ja-week__corner" />
            {DAYS.map(day => {
              const iso = dayISO(day);
              return (
                <div key={day} className={'ja-week__day' + (iso === today ? ' is-today' : '')}>
                  <span className="ja-week__day-name">{format(toDate(iso), 'EEE')}</span>
                  <span className="ja-week__day-date">{dateShort(iso)}</span>
                </div>
              );
            })}

            {slots.map(slot => (
              <React.Fragment key={slot}>
                <div className="ja-week__slot">{timeLabel(slot)}</div>
                {DAYS.map(day => {
                  const iso = dayISO(day);
                  const meeting = at(day, slot);
                  return (
                    <div
                      key={`${slot}-${day}`}
                      className={'ja-week__cell' + (iso === today ? ' is-today' : '')}
                    >
                      {meeting && (
                        <MeetingBlock
                          meeting={meeting}
                          today={today}
                          // Only a class whose roll this person takes opens.
                          onOpen={
                            mayTakeRoll(state, user, meeting.id)
                              ? () => nav(`/roll/${meeting.id}`)
                              : undefined
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </TableScroll>
      )}
    </Card>
  );
}

function MeetingBlock({
  meeting,
  today,
  onOpen,
}: {
  meeting: ClassMeeting;
  today: string;
  onOpen?: () => void;
}) {
  const { state } = useStore();
  const ensemble = ensembleById(state, meeting.ensembleId);
  const submitted = Boolean(meeting.rollSubmittedAt);
  const due = !submitted && meeting.date <= today;

  const title = `${ensemble?.name ?? 'Class'} · ${timeRange(meeting)} · ${placeLabel(state, meeting.venueId, meeting.room)}`;
  const style = { ['--block-tone' as string]: TONE_COLOR[ensemble?.tone ?? 'neutral'] };
  const body = (
    <>
      <span className="ja-week__block-top">
        <span className="ja-week__block-name">{ensemble?.name ?? 'Class'}</span>
        {submitted && <Icon name="check" size={13} color="var(--teal-500)" />}
        {due && <Icon name="circle-alert" size={13} color="var(--gold-500)" />}
      </span>
      <span className="ja-week__block-room">
        {placeLabel(state, meeting.venueId, meeting.room)}
      </span>
      <span className="ja-week__block-foot">
        <OwnerAvatar staffId={ensemble?.leadStaffId} size={20} />
      </span>
    </>
  );

  return onOpen ? (
    <button type="button" className="ja-week__block" style={style} onClick={onOpen} title={title}>
      {body}
    </button>
  ) : (
    <div className="ja-week__block is-static" style={style} title={title}>
      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Term
// ---------------------------------------------------------------------------

function TermView({
  onEditTerm,
  onEditEnsemble,
}: {
  /** Opens Add session (no term) or Edit session. Unset for a role that may not. */
  onEditTerm?: (term?: Term) => void;
  /** Opens Add ensemble (no ensemble) or Edit ensemble. Unset for a role that may not. */
  onEditEnsemble?: (ensemble?: Ensemble) => void;
}) {
  const { state, today, actions } = useStore();
  const mayEdit = useCan()('schedule', 'edit');
  const toast = useToast();
  const term = termForDate(state, today);
  // ?archived=1 lists the archived ensembles after the current ones; the
  // sessions card has its own switch, held on the card.
  const [showArchived, setShowArchived] = useArchivedParam();
  const [showArchivedTerms, setShowArchivedTerms] = React.useState(false);
  const [archiving, setArchiving] = React.useState<Ensemble | null>(null);
  const [archivingTerm, setArchivingTerm] = React.useState<Term | null>(null);

  const anyTerms = activeOnly(state.teaching.terms).length > 0;

  return (
    <>
      {term ? (
        <SessionCard term={term} />
      ) : (
        <Card padding="0">
          <EmptyState
            icon={<Icon name="calendar" size={22} />}
            title={anyTerms ? 'No session coming up' : 'No session yet'}
            message={
              anyTerms
                ? 'The last session has finished. Its weeks show up here once the next one is added.'
                : onEditTerm
                  ? 'The weeks of a session show up here, each one marked once its roll call is in. Add a session with its dates to start.'
                  : 'The weeks of a session show up here, each one marked once its roll call is in, once the office adds one.'
            }
            action={
              onEditTerm ? (
                <Button variant="secondary" size="sm" onClick={() => onEditTerm()}>
                  Add session
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {state.teaching.terms.length > 0 && (
        <SessionsCard
          current={term}
          showArchived={showArchivedTerms}
          onShowArchived={setShowArchivedTerms}
          onEdit={onEditTerm}
          onArchive={setArchivingTerm}
          onRestore={t => {
            actions.teaching.restoreTerm(t.id);
            toast({
              tone: 'success',
              title: 'Session restored',
              message: `${t.name} is back on the session list.`,
            });
          }}
        />
      )}

      <EnsemblesCard
        term={term}
        showArchived={showArchived}
        onShowArchived={setShowArchived}
        onEdit={onEditEnsemble}
        onArchive={setArchiving}
        onRestore={e => {
          actions.teaching.restoreEnsemble(e.id);
          toast({
            tone: 'success',
            title: 'Ensemble restored',
            message: `${e.name} is back on the week grid and in Add class.`,
          });
        }}
      />

      {archiving && mayEdit && (
        <ArchiveDialog
          title={`Archive ${archiving.name}?`}
          message="Its classes from today on leave the week grid, and Add class stops offering it. Its students stay where they are, and past classes, roll calls and attendance stay. You can restore it."
          onConfirm={() => {
            actions.teaching.archiveEnsemble(archiving.id);
            toast({
              tone: 'success',
              title: 'Ensemble archived',
              message: `${archiving.name} is off the week grid from today. Restore it from Show archived.`,
            });
          }}
          onClose={() => setArchiving(null)}
        />
      )}

      {archivingTerm && mayEdit && (
        <ArchiveDialog
          title={`Archive ${archivingTerm.name}?`}
          message="It leaves the session list and stops being the current session. Its classes, roll calls and attendance stay as they are. You can restore it."
          onConfirm={() => {
            actions.teaching.archiveTerm(archivingTerm.id);
            toast({
              tone: 'success',
              title: 'Session archived',
              message: `${archivingTerm.name} is off the session list. Restore it from Show archived.`,
            });
          }}
          onClose={() => setArchivingTerm(null)}
        />
      )}
    </>
  );
}

/** The current session: its weeks as a row of dots, each filled once its roll call is in. */
function SessionCard({ term }: { term: Term }) {
  const { state, today } = useStore();

  // The session's weeks, taken from the first current ensemble's meetings.
  const first = activeOnly(state.teaching.ensembles)[0] ?? state.teaching.ensembles[0];
  const weeks = state.teaching.meetings
    .filter(m => m.ensembleId === first?.id && m.date >= term.start && m.date <= term.end)
    .sort((a, b) => a.date.localeCompare(b.date));
  const done = weeks.filter(m => m.rollSubmittedAt).length;
  // "Sunday" for an ensemble that meets on Sundays, "Monday" for one on Mondays.
  const day = weeks[0] ? format(toDate(weeks[0].date), 'EEEE') : undefined;
  const planned = `${term.meetingsPlanned} ${term.meetingsPlanned === 1 ? 'week' : 'weeks'}`;

  return (
    <Card
      title={term.name}
      subtitle={[
        dateRange(term.start, term.end),
        planned,
        day && `${done} of ${weeks.length} ${day}s taken`,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {weeks.length === 0 ? (
        <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
          No classes in this session yet. Each week shows up here as a dot once an ensemble has
          classes on the schedule.
        </p>
      ) : (
        <>
          <div className="ja-term-dots">
            {weeks.map((m, i) => {
              const submitted = Boolean(m.rollSubmittedAt);
              const isNow = m.date === today;
              return (
                <span key={m.id} className="ja-term-dot">
                  <span
                    className={
                      'ja-term-dot__mark' + (submitted ? ' is-done' : '') + (isNow ? ' is-now' : '')
                    }
                  />
                  <span className="ja-term-dot__date">{dateShort(m.date)}</span>
                  <span className="ja-term-dot__week">{`Week ${i + 1}`}</span>
                </span>
              );
            })}
          </div>
          <p
            style={{
              margin: 'var(--space-5) 0 0',
              font: 'var(--type-body-sm)',
              color: 'var(--text-muted)',
            }}
          >
            {`A filled dot is a ${day} whose roll call is in. The ringed dot is today.`}
          </p>
        </>
      )}
    </Card>
  );
}

/** Every session: its dates and classes planned, with Edit, Archive and Restore for the office. */
function SessionsCard({
  current,
  showArchived,
  onShowArchived,
  onEdit,
  onArchive,
  onRestore,
}: {
  current: Term | undefined;
  showArchived: boolean;
  onShowArchived: (next: boolean) => void;
  onEdit?: (term?: Term) => void;
  onArchive: (term: Term) => void;
  onRestore: (term: Term) => void;
}) {
  const { state, today } = useStore();
  const rows = termsList(state, showArchived);

  return (
    <Card
      title="Sessions"
      subtitle="Each session's dates, and how many classes each ensemble meets for"
      padding="0"
      action={
        <ShowArchivedSwitch
          count={archivedOnly(state.teaching.terms).length}
          checked={showArchived}
          onChange={onShowArchived}
        />
      }
    >
      <TableScroll minWidth={640}>
        <DataTable
          rows={rows}
          emptyLabel="Every session is archived. Show archived lists them."
          columns={[
            {
              key: 'name',
              label: 'Session',
              width: '1.6fr',
              strong: true,
              render: (t: Term) => (
                <span
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
                >
                  <ArchivedName name={t.name} record={t} />
                  {t.id === current?.id && (
                    <Badge tone="blue">{t.start <= today ? 'Now' : 'Next'}</Badge>
                  )}
                </span>
              ),
            },
            {
              key: 'dates',
              label: 'Dates',
              width: '1.4fr',
              render: (t: Term) => dateRange(t.start, t.end),
            },
            {
              key: 'planned',
              label: 'Classes planned',
              width: '140px',
              align: 'right',
              mono: true,
              render: (t: Term) => String(t.meetingsPlanned),
            },
            ...(onEdit
              ? [
                  {
                    key: 'actions',
                    label: '',
                    width: '140px',
                    align: 'right' as const,
                    render: (t: Term) => (
                      <RowActions
                        archived={isArchived(t)}
                        onEdit={() => onEdit(t)}
                        onArchive={() => onArchive(t)}
                        onRestore={() => onRestore(t)}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </TableScroll>
      {onEdit && <CardFootAdd label="Add session" onClick={() => onEdit()} />}
    </Card>
  );
}

/** The ensembles: who meets when, where and with whom, and how many are on each roster. */
function EnsemblesCard({
  term,
  showArchived,
  onShowArchived,
  onEdit,
  onArchive,
  onRestore,
}: {
  term: Term | undefined;
  showArchived: boolean;
  onShowArchived: (next: boolean) => void;
  onEdit?: (ensemble?: Ensemble) => void;
  onArchive: (ensemble: Ensemble) => void;
  onRestore: (ensemble: Ensemble) => void;
}) {
  const nav = useNavigate();
  const { state, today, user } = useStore();
  const allowed = useCan();

  // With no session, every class counts.
  const inRange = (m: ClassMeeting) => !term || (m.date >= term.start && m.date <= term.end);
  const rows = ensemblesList(state, showArchived).map(e => {
    const meetings = state.teaching.meetings
      .filter(m => m.ensembleId === e.id && inRange(m))
      .sort((a, b) => a.date.localeCompare(b.date));
    // When it meets reads from any of its classes; the roll from one still on the
    // schedule, so an archived ensemble shows no roll due.
    return {
      id: e.id,
      ensemble: e,
      usual: meetings[0],
      first: meetings.find(m => isScheduled(state, m)),
    };
  });

  type Row = (typeof rows)[number];

  return (
    <Card
      title="Ensembles"
      subtitle="Who meets when, and how many are on each roster"
      padding="0"
      action={
        <ShowArchivedSwitch
          count={archivedOnly(state.teaching.ensembles).length}
          checked={showArchived}
          onChange={onShowArchived}
        />
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={<Icon name="users" size={22} />}
          title="No ensembles yet"
          message={
            onEdit
              ? 'An ensemble is a standing group: the same students, the same place, the same hour each week. Add one, then put its classes on the schedule with Add class.'
              : 'An ensemble is a standing group: the same students, the same place, the same hour each week. They show up here once the office adds them.'
          }
          action={
            onEdit ? (
              <Button variant="secondary" size="sm" onClick={() => onEdit()}>
                Add ensemble
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <TableScroll minWidth={880}>
            <DataTable
              rows={rows}
              onRowClick={(r: Row) => {
                // A row opens the first roll call for whoever takes it, else the roster.
                if (r.first && mayTakeRoll(state, user, r.first.id)) nav(`/roll/${r.first.id}`);
                else if (allowed('students')) nav('/students');
              }}
              columns={[
                {
                  key: 'name',
                  label: 'Ensemble',
                  width: '1.4fr',
                  strong: true,
                  render: (r: Row) => (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span
                        style={{
                          width: 3,
                          height: 18,
                          borderRadius: 2,
                          flex: '0 0 auto',
                          background: TONE_COLOR[r.ensemble.tone],
                        }}
                      />
                      <ArchivedName name={r.ensemble.name} record={r.ensemble} />
                    </span>
                  ),
                },
                {
                  key: 'program',
                  label: 'Program',
                  width: '1fr',
                  // The short name fits the column; the full one is a hover away.
                  render: (r: Row) => (
                    <span
                      style={{ color: 'var(--text-muted)' }}
                      title={programName(state, r.ensemble.programId)}
                    >
                      {programById(state, r.ensemble.programId)?.short ??
                        programName(state, r.ensemble.programId)}
                    </span>
                  ),
                },
                {
                  key: 'when',
                  label: 'When',
                  width: '1.4fr',
                  render: (r: Row) =>
                    r.usual ? (
                      `${format(toDate(r.usual.date), 'EEEE')} · ${timeRange(r.usual)}`
                    ) : (
                      <span style={{ color: 'var(--text-faint)' }}>No classes yet</span>
                    ),
                },
                {
                  key: 'where',
                  label: 'Where',
                  width: '1.3fr',
                  render: (r: Row) => placeLabel(state, r.ensemble.venueId, r.ensemble.room),
                },
                {
                  key: 'lead',
                  label: 'Lead',
                  width: '1.2fr',
                  render: (r: Row) => (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <OwnerAvatar staffId={r.ensemble.leadStaffId} size={22} />
                      <span style={{ color: 'var(--text-muted)' }}>
                        {staffById(state, r.ensemble.leadStaffId)?.name ?? '—'}
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'enrolled',
                  label: 'Enrolled',
                  width: '90px',
                  align: 'right',
                  mono: true,
                  render: (r: Row) => String(ensembleCount(state, r.ensemble.id)),
                },
                {
                  key: 'roll',
                  label: 'Next roll',
                  width: '120px',
                  render: (r: Row) =>
                    r.first ? (
                      <RollBadge
                        submitted={Boolean(r.first.rollSubmittedAt)}
                        due={!r.first.rollSubmittedAt && r.first.date <= today}
                      />
                    ) : null,
                },
                ...(onEdit
                  ? [
                      {
                        key: 'actions',
                        label: '',
                        width: '120px',
                        align: 'right' as const,
                        render: (r: Row) => (
                          <RowActions
                            archived={isArchived(r.ensemble)}
                            onEdit={() => onEdit(r.ensemble)}
                            onArchive={() => onArchive(r.ensemble)}
                            onRestore={() => onRestore(r.ensemble)}
                          />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </TableScroll>
          {onEdit && <CardFootAdd label="Add ensemble" onClick={() => onEdit()} />}
        </>
      )}
    </Card>
  );
}
