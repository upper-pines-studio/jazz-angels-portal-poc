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
import {
  dateRange,
  dateShort,
  placeLabel,
  programName,
  staffById,
  toDate,
  toISO,
  useStore,
} from '../../../core';
import {
  ensembleById,
  ensembleCount,
  meetingsForWeek,
  termForDate,
  termWeek,
  timeLabel,
  timeRange,
  weekStart,
} from '../domain';
import type { ClassMeeting } from '../domain';
import { RollBadge, TONE_COLOR } from './parts';
import AddClassDialog from './schedule/AddClassDialog';
import './schedule.css';

/** Sunday through Thursday: the five days Jazz Angels teaches on. */
const DAYS = [0, 1, 2, 3, 4];

export default function Schedule() {
  const nav = useNavigate();
  const { state, today } = useStore();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'term' ? 'term' : 'week';

  const [start, setStart] = React.useState(() => weekStart(today));
  const [adding, setAdding] = React.useState(false);

  const term = termForDate(state, today);
  const week = termWeek(term, today);

  usePageHeader({
    title: 'Schedule',
    subtitle: term
      ? `${term.name}${week ? ` · week ${week} of ${term.meetingsPlanned}` : ''} · ${state.teaching.ensembles.length} ensembles`
      : `${state.teaching.ensembles.length} ensembles`,
    actions: (
      <Button
        variant="primary"
        size="sm"
        iconLeft={<Icon name="plus" size={15} />}
        onClick={() => setAdding(true)}
      >
        Add class
      </Button>
    ),
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
        <WeekGrid start={start} onStart={setStart} onAdd={() => setAdding(true)} />
      ) : (
        <TermView />
      )}

      {adding && (
        <AddClassDialog
          open
          onClose={() => setAdding(false)}
          defaultDate={view === 'week' ? start : today}
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
}: {
  start: string;
  onStart: (iso: string) => void;
  onAdd: () => void;
}) {
  const nav = useNavigate();
  const { state, today } = useStore();

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

      {slots.length === 0 ? (
        <EmptyState
          icon={<Icon name="calendar" size={22} />}
          title="No classes this week"
          message="Classes for the week show up here as a grid. Add a class to put one on the schedule."
          action={
            <Button variant="secondary" size="sm" onClick={onAdd}>
              Add class
            </Button>
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
                          onOpen={() => nav(`/roll/${meeting.id}`)}
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
  onOpen: () => void;
}) {
  const { state } = useStore();
  const ensemble = ensembleById(state, meeting.ensembleId);
  const submitted = Boolean(meeting.rollSubmittedAt);
  const due = !submitted && meeting.date <= today;

  return (
    <button
      type="button"
      className="ja-week__block"
      style={{ ['--block-tone' as string]: TONE_COLOR[ensemble?.tone ?? 'neutral'] }}
      onClick={onOpen}
      title={`${ensemble?.name ?? 'Class'} · ${timeRange(meeting)} · ${placeLabel(state, meeting.venueId, meeting.room)}`}
    >
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
    </button>
  );
}

// ---------------------------------------------------------------------------
// Term
// ---------------------------------------------------------------------------

function TermView() {
  const nav = useNavigate();
  const { state, today } = useStore();
  const term = termForDate(state, today);

  if (!term) {
    return (
      <Card padding="0">
        <EmptyState
          icon={<Icon name="calendar" size={22} />}
          title="No session scheduled"
          message="The weeks of a session show up here once one is on the calendar."
        />
      </Card>
    );
  }

  // The session's Sundays, taken from the first Sunday ensemble's meetings.
  const sundays = state.teaching.meetings
    .filter(
      m =>
        m.ensembleId === state.teaching.ensembles[0]?.id &&
        m.date >= term.start &&
        m.date <= term.end,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const done = sundays.filter(m => m.rollSubmittedAt).length;

  const rows = state.teaching.ensembles.map(e => {
    const first = state.teaching.meetings
      .filter(m => m.ensembleId === e.id && m.date >= term.start && m.date <= term.end)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    return { id: e.id, ensemble: e, first };
  });

  type Row = (typeof rows)[number];

  return (
    <>
      <Card
        title={term.name}
        subtitle={`${dateRange(term.start, term.end)} · ${term.meetingsPlanned} weeks · ${done} of ${sundays.length} Sundays taken`}
      >
        <div className="ja-term-dots">
          {sundays.map((m, i) => {
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
          A filled dot is a Sunday whose roll call is in. The ringed dot is today.
        </p>
      </Card>

      <Card
        title="Ensembles"
        subtitle="Who meets when, and how many are on each roster"
        padding="0"
      >
        <TableScroll minWidth={820}>
          <DataTable
            rows={rows}
            onRowClick={(r: Row) => (r.first ? nav(`/roll/${r.first.id}`) : nav('/students'))}
            columns={[
              {
                key: 'name',
                label: 'Ensemble',
                width: '1.4fr',
                strong: true,
                render: (r: Row) => (
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)' }}
                  >
                    <span
                      style={{
                        width: 3,
                        height: 18,
                        borderRadius: 2,
                        flex: '0 0 auto',
                        background: TONE_COLOR[r.ensemble.tone],
                      }}
                    />
                    {r.ensemble.name}
                  </span>
                ),
              },
              {
                key: 'program',
                label: 'Program',
                width: '1.3fr',
                render: (r: Row) => (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {programName(state, r.ensemble.programId)}
                  </span>
                ),
              },
              {
                key: 'when',
                label: 'When',
                width: '1.4fr',
                render: (r: Row) =>
                  r.first ? (
                    `${format(toDate(r.first.date), 'EEEE')} · ${timeRange(r.first)}`
                  ) : (
                    <span style={{ color: 'var(--text-faint)' }}>—</span>
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
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
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
            ]}
          />
        </TableScroll>
      </Card>
    </>
  );
}
