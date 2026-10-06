import React from 'react';
import { addWeeks, format } from 'date-fns';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  IconButton,
  ProgressBar,
  Select,
  StatCard,
} from '../../../design-system';
import { usePageHeader } from '../../../app/Shell';
import { useToast } from '../../../app/ToastHost';
import { OwnerAvatar } from '../../../app/components/badges';
import { TableScroll } from '../../../app/components/TableScroll';
import {
  dateRange,
  dateShort,
  programById,
  programName,
  staffById,
  toDate,
  toISO,
  useCan,
  useStore,
} from '../../../core';
import type { ProgramId } from '../../../core';
import {
  entriesForWeek,
  formatHours,
  hoursByProgram,
  hoursForProgram,
  hoursThisMonth,
  mayApprove,
  monthLabel,
  monthRange,
  teachersThisMonth,
  visibleEntries,
  weekRange,
  weekStart,
  weekTotals,
} from '../domain';
import type { TimeEntry, TimeEntryStatus } from '../domain';
import LogHoursDialog from './LogHoursDialog';
import './timesheets.css';

/** Draft is nobody's problem yet, submitted is the office's, approved is done. */
const STATUS: Record<TimeEntryStatus, { label: string; tone: 'neutral' | 'gold' | 'teal' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'gold' },
  approved: { label: 'Approved', tone: 'teal' },
};

/**
 * In-school hours are the ones a grant report asks for, so they keep the teal
 * they carry in the stat row. Every other program shares the lead blue: the
 * bars compare one measure, and the name tells them apart.
 */
function barColor(programId: ProgramId): string {
  return programId === 'in-school' ? 'var(--teal-500)' : 'var(--blue-500)';
}

export default function Timesheets() {
  const { state, today, actions, user } = useStore();
  const allowed = useCan();
  const toast = useToast();
  // A role that approves sees everyone's hours; anyone else sees their own (decision 0001).
  const seesEveryone = allowed('timesheets-approve', 'edit');
  const mayLog = allowed('timesheets-log', 'edit', true);

  const [monday, setMonday] = React.useState(() => weekStart(today));
  const [teacher, setTeacher] = React.useState('all');
  const [logging, setLogging] = React.useState(false);

  const thisMonday = weekStart(today);
  const shiftWeeks = (by: number) => setMonday(toISO(addWeeks(toDate(monday), by)));

  // The stat row summarises today's week and this month; the card below follows
  // whichever week is on screen.
  const thisWeek = weekTotals(state, thisMonday);
  const month = monthRange(today);
  const monthHours = hoursThisMonth(state, today);
  const teachers = teachersThisMonth(state, today);
  const inSchool = hoursForProgram(state, 'in-school', month.from, month.to);
  const teachingStaff = state.core.staff.filter(s => s.teaches);

  usePageHeader({
    title: 'Timesheets',
    subtitle: `${monthLabel(today)} · ${teachingStaff.length} teaching artists`,
  });

  const week = weekRange(monday);
  const shown = visibleEntries(user, entriesForWeek(state, monday)).filter(
    e => !seesEveryone || teacher === 'all' || e.staffId === teacher,
  );
  const shownHours = shown.reduce((sum, e) => sum + e.hours, 0);

  const approve = (entry: TimeEntry) => {
    actions.timesheets.approveEntry(entry.id);
    toast({
      tone: 'success',
      title: 'Hours approved',
      message: `${staffById(state, entry.staffId)?.name ?? 'Teacher'} · ${formatHours(entry.hours)} hrs`,
    });
  };

  const programHours = hoursByProgram(state, month);
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
                    ...teachingStaff.map(s => ({ value: s.id, label: s.name })),
                  ]}
                  style={{ width: '100%' }}
                />
              </div>
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
          <TableScroll minWidth={900}>
            <DataTable
              rows={shown}
              columns={[
                {
                  key: 'day',
                  label: 'Day',
                  width: '110px',
                  mono: true,
                  render: (r: TimeEntry) => format(toDate(r.date), 'EEE MMM d'),
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
                { key: 'activity', label: 'Activity', width: '1.8fr', wrap: true },
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
                  width: '120px',
                  render: (r: TimeEntry) => (
                    <Badge tone={STATUS[r.status].tone} dot>
                      {STATUS[r.status].label}
                    </Badge>
                  ),
                },
                {
                  key: 'approve',
                  label: '',
                  width: '100px',
                  // Nobody approves their own hours, so the button is not there on them.
                  render: (r: TimeEntry) =>
                    r.status === 'submitted' && mayApprove(user, r) ? (
                      <Button size="sm" variant="ghost" onClick={() => approve(r)}>
                        Approve
                      </Button>
                    ) : null,
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
                    color={barColor(programId)}
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
