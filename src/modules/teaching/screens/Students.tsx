import React from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Icon,
  Input,
  Select,
  Tabs,
  Tag,
} from '../../../design-system';
import { usePageHeader } from '../../../app/Shell';
import { Eyebrow, KV } from '../../../app/components/badges';
import { TableScroll } from '../../../app/components/TableScroll';
import { cell, placeLabel, programName, useCan, useStore } from '../../../core';
import type { ProgramId } from '../../../core';
import {
  attendanceRateForStudent,
  ensembleById,
  ensembleCount,
  enrolledCount,
  leadsEnsemble,
  percent,
  rosterFor,
  termForDate,
} from '../domain';
import type { Mark, RosterStudent } from '../domain';
import { MarkDots, TONE_COLOR } from './parts';
import EnrollStudentDialog from './students/EnrollStudentDialog';

const ALL = 'all';
const WAITLIST = 'waitlist';

const STATUS_TONE = { enrolled: 'teal', waitlist: 'neutral', alumni: 'blue' } as const;
const STATUS_LABEL = { enrolled: 'Enrolled', waitlist: 'Waitlist', alumni: 'Alumni' } as const;

/**
 * The roster, as decision 0001 allows it: the office sees and edits every
 * student; an office assistant sees them without guardian contacts; a teacher
 * sees their own classes' students with contacts; Read-only sees counts.
 */
export default function Students() {
  const { user } = useStore();
  return cell(user.role, 'students') === 'Counts only' ? <StudentCounts /> : <Roster />;
}

function Roster() {
  const { state, today, user } = useStore();
  const allowed = useCan();
  const mayEdit = allowed('students', 'edit');
  // The column shows where the role may see contacts at all; `rosterFor` has
  // already left them off every record this person may not see them on.
  const showGuardian = allowed('guardian-contacts');
  const ownOnly = cell(user.role, 'students') === 'Own classes';
  const students = rosterFor(state, user);
  const enrolledIn = (programId?: ProgramId) =>
    students.filter(s => s.status === 'enrolled' && (!programId || s.programId === programId))
      .length;
  const waiting = students.filter(s => s.status === 'waitlist').length;

  const [tab, setTab] = React.useState<string>(ALL);
  const [q, setQ] = React.useState('');
  const [ensembleFilter, setEnsembleFilter] = React.useState(ALL);
  const [selectedId, setSelectedId] = React.useState<string | undefined>();
  const [enrolling, setEnrolling] = React.useState(false);

  const term = termForDate(state, today);
  const window = term ? { from: term.start, to: term.end } : undefined;

  usePageHeader({
    title: 'Students',
    subtitle: ownOnly
      ? `${enrolledIn()} in your classes`
      : `${enrolledIn()} enrolled · ${waiting} waiting`,
    actions: mayEdit ? (
      <Button
        variant="primary"
        size="sm"
        iconLeft={<Icon name="user-plus" size={15} />}
        onClick={() => setEnrolling(true)}
      >
        Enroll student
      </Button>
    ) : undefined,
  });

  /** Tabs: every student, then each program with somebody in it, then the waitlist. */
  const programsWithStudents = state.core.programs.filter(p =>
    students.some(s => s.status === 'enrolled' && s.programId === p.id),
  );
  const tabs = [
    { id: ALL, label: ownOnly ? 'Your students' : 'All students', count: enrolledIn() },
    ...programsWithStudents.map(p => ({
      id: p.id,
      label: p.short,
      count: enrolledIn(p.id),
    })),
    // A teacher's classes have no waitlist: a waiting student is in no class yet.
    ...(ownOnly ? [] : [{ id: WAITLIST, label: 'Waitlist', count: waiting }]),
  ];
  const ensembles = ownOnly
    ? state.teaching.ensembles.filter(e => leadsEnsemble(state, user, e.id))
    : state.teaching.ensembles;

  const inTab = (s: RosterStudent) =>
    tab === WAITLIST
      ? s.status === 'waitlist'
      : s.status === 'enrolled' && (tab === ALL || s.programId === tab);

  const needle = q.trim().toLowerCase();
  const rows = students
    .filter(inTab)
    .filter(s => ensembleFilter === ALL || s.ensembleId === ensembleFilter)
    .filter(
      s =>
        !needle ||
        s.name.toLowerCase().includes(needle) ||
        s.instrument.toLowerCase().includes(needle) ||
        !!s.guardianName?.toLowerCase().includes(needle),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const selected = students.find(s => s.id === selectedId) ?? rows[0];

  /** This session's rate, or last session's in muted type where this one has no marks. */
  const attendanceCell = (s: RosterStudent) => {
    const thisTerm = window ? attendanceRateForStudent(state, s.id, window) : undefined;
    if (thisTerm !== undefined) return <span>{percent(thisTerm)}</span>;
    const everything = attendanceRateForStudent(state, s.id);
    if (everything === undefined) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
    return (
      <span style={{ color: 'var(--text-muted)' }} title="Last session">
        {percent(everything)}
      </span>
    );
  };

  return (
    <>
      <div className="ja-tabs-scroll">
        <Tabs tabs={tabs} active={tab} onChange={setTab} style={{ borderBottom: 0 }} />
      </div>

      <div className="ja-split" style={{ gap: 'var(--space-4)' }}>
        <Card
          padding="0"
          title="Roster"
          subtitle={
            term
              ? `Attendance is ${term.name}, or last session where this one has no marks yet`
              : 'The whole roster'
          }
        >
          <div
            className="ja-filter-bar"
            style={{
              padding: 'var(--space-4) var(--space-5)',
              borderBottom: 'var(--border-width) solid var(--border-subtle)',
            }}
          >
            <div className="ja-filter-bar__search">
              <Input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={showGuardian ? 'Search students or guardians' : 'Search students'}
                prefix={<Icon name="search" size={15} />}
                style={{ width: '100%' }}
              />
            </div>
            <div className="ja-filter-bar__select">
              <Select
                value={ensembleFilter}
                onChange={e => setEnsembleFilter(e.target.value)}
                options={[
                  { value: ALL, label: 'All ensembles' },
                  ...ensembles.map(e => ({ value: e.id, label: e.name })),
                ]}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<Icon name="users" size={22} />}
              title="Nobody here yet"
              message={
                mayEdit
                  ? 'No students in this view yet. Enroll a student to add them to the roster.'
                  : 'No students in this view yet.'
              }
              action={
                mayEdit ? (
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<Icon name="user-plus" size={15} />}
                    onClick={() => setEnrolling(true)}
                  >
                    Enroll student
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableScroll minWidth={880}>
              <DataTable
                rows={rows}
                onRowClick={(s: RosterStudent) => setSelectedId(s.id)}
                columns={[
                  {
                    key: 'name',
                    label: 'Student',
                    width: '1.6fr',
                    strong: true,
                    render: (s: RosterStudent) => (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                        }}
                      >
                        <Avatar name={s.name} size={24} />
                        {s.name}
                      </span>
                    ),
                  },
                  {
                    key: 'instrument',
                    label: 'Instrument',
                    width: '1.1fr',
                    render: (s: RosterStudent) => s.instrument,
                  },
                  {
                    key: 'ensemble',
                    label: 'Ensemble',
                    width: '1.1fr',
                    render: (s: RosterStudent) => {
                      const e = ensembleById(state, s.ensembleId);
                      return e ? (
                        <span>{e.name}</span>
                      ) : (
                        <span style={{ color: 'var(--text-faint)' }}>Not placed</span>
                      );
                    },
                  },
                  ...(showGuardian
                    ? [
                        {
                          key: 'guardian',
                          label: 'Guardian',
                          width: '1.2fr',
                          render: (s: RosterStudent) => (
                            <span style={{ color: 'var(--text-muted)' }}>{s.guardianName}</span>
                          ),
                        },
                      ]
                    : []),
                  {
                    key: 'attendance',
                    label: 'Attendance',
                    width: '110px',
                    mono: true,
                    align: 'right',
                    render: attendanceCell,
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    width: '110px',
                    render: (s: RosterStudent) => (
                      <Badge tone={STATUS_TONE[s.status]} dot>
                        {STATUS_LABEL[s.status]}
                      </Badge>
                    ),
                  },
                ]}
              />
            </TableScroll>
          )}
        </Card>

        {selected ? (
          <StudentCard student={selected} mayEdit={mayEdit} />
        ) : (
          <Card padding="0">
            <EmptyState
              icon={<Icon name="user" size={22} />}
              title="No student selected"
              message={
                showGuardian
                  ? 'Pick a row on the left and their contact details and attendance show up here.'
                  : 'Pick a row on the left and their attendance shows up here.'
              }
            />
          </Card>
        )}
      </div>

      {enrolling && mayEdit && (
        <EnrollStudentDialog
          open
          onClose={() => setEnrolling(false)}
          defaultProgramId={tab !== ALL && tab !== WAITLIST ? (tab as ProgramId) : undefined}
          defaultEnsembleId={ensembleFilter !== ALL ? ensembleFilter : undefined}
          onEnrolled={setSelectedId}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The selected student
// ---------------------------------------------------------------------------

const WAITLIST_OPTION = '__waitlist__';

function StudentCard({ student, mayEdit }: { student: RosterStudent; mayEdit: boolean }) {
  const { state, today, actions } = useStore();
  const ensemble = ensembleById(state, student.ensembleId);
  const term = termForDate(state, today);

  const thisTerm = term
    ? attendanceRateForStudent(state, student.id, { from: term.start, to: term.end })
    : undefined;
  const allTime = attendanceRateForStudent(state, student.id);

  // The last five marks anywhere, oldest first, as a row of dots.
  const dateOf = new Map(state.teaching.meetings.map(m => [m.id, `${m.date} ${m.start}`]));
  const recent: Mark[] = state.teaching.attendance
    .filter(a => a.studentId === student.id)
    .sort((a, b) => (dateOf.get(a.meetingId) ?? '').localeCompare(dateOf.get(b.meetingId) ?? ''))
    .slice(-5)
    .map(a => a.mark);

  const ensembles = state.teaching.ensembles.filter(e => e.programId === student.programId);

  const move = (next: string) => {
    if (next === WAITLIST_OPTION) {
      actions.teaching.updateStudent(student.id, { ensembleId: undefined, status: 'waitlist' });
    } else {
      actions.teaching.updateStudent(student.id, { ensembleId: next, status: 'enrolled' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Card padding="var(--space-5)">
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
          <Avatar name={student.name} size={56} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                font: 'var(--weight-semibold) var(--text-lg)/1.2 var(--font-display)',
                letterSpacing: 'var(--tracking-display)',
                color: 'var(--text-strong)',
              }}
            >
              {student.name}
            </div>
            <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
              {`${student.instrument} · year ${student.yearsIn}`}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            margin: 'var(--space-5) 0',
          }}
        >
          <Tag>{student.instrument}</Tag>
          {ensemble && <Tag color={TONE_COLOR[ensemble.tone]}>{ensemble.name}</Tag>}
          <Badge tone={STATUS_TONE[student.status]} dot>
            {STATUS_LABEL[student.status]}
          </Badge>
        </div>

        <div>
          {student.guardianName !== undefined && (
            <>
              <KV k="Guardian" v={student.guardianName} />
              <KV k="Phone" v={student.guardianPhone ?? 'Not on file'} />
            </>
          )}
          <KV k="Program" v={programName(state, student.programId)} />
          <KV k="Ensemble" v={ensemble?.name ?? 'Not placed'} />
          <KV k={term ? term.name : 'This session'} v={percent(thisTerm)} strong />
          <KV k="All sessions" v={percent(allTime)} />
        </div>

        <div style={{ marginTop: 'var(--space-5)' }}>
          <Eyebrow>Last five marks</Eyebrow>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <MarkDots marks={recent} />
          </div>
        </div>
      </Card>

      {mayEdit && (
        <Card
          title="Placement"
          subtitle="Moving a student takes effect on the next roll call"
          padding="var(--space-5)"
        >
          <Field label="Ensemble">
            <Select
              value={student.ensembleId ?? WAITLIST_OPTION}
              onChange={e => move(e.target.value)}
              options={[
                { value: WAITLIST_OPTION, label: 'Waitlist' },
                ...ensembles.map(e => ({
                  value: e.id,
                  label: `${e.name} · ${placeLabel(state, e.venueId, e.room)}`,
                })),
              ]}
              style={{ width: '100%' }}
            />
          </Field>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Counts only (Read-only)
// ---------------------------------------------------------------------------

/**
 * What a board member or an auditor sees: how many students each program and
 * each ensemble has, and no names. Nothing personal is read here.
 */
function StudentCounts() {
  const { state } = useStore();
  const waiting = state.teaching.students.filter(s => s.status === 'waitlist').length;

  usePageHeader({
    title: 'Students',
    subtitle: `${enrolledCount(state)} enrolled · ${waiting} waiting`,
  });

  const programs = state.core.programs
    .map(p => ({ id: p.id, name: p.name, enrolled: enrolledCount(state, p.id) }))
    .filter(p => p.enrolled > 0);
  const ensembles = state.teaching.ensembles.map(e => ({
    id: e.id,
    name: e.name,
    program: programName(state, e.programId),
    place: placeLabel(state, e.venueId, e.room),
    enrolled: ensembleCount(state, e.id),
  }));

  return (
    <div className="ja-split" style={{ gap: 'var(--space-4)' }}>
      <Card
        padding="0"
        title="Enrolled by ensemble"
        subtitle="Counts only. Names and contacts stay with the office."
      >
        <TableScroll minWidth={560}>
          <DataTable
            rows={ensembles}
            columns={[
              { key: 'name', label: 'Ensemble', width: '1.4fr', strong: true },
              { key: 'program', label: 'Program', width: '1.4fr' },
              { key: 'place', label: 'Where', width: '1.4fr' },
              { key: 'enrolled', label: 'Enrolled', width: '100px', mono: true, align: 'right' },
            ]}
            emptyLabel="No ensembles yet."
          />
        </TableScroll>
      </Card>
      <Card padding="0" title="By program">
        <DataTable
          rows={[...programs, { id: 'waitlist', name: 'Waitlist', enrolled: waiting }]}
          columns={[
            { key: 'name', label: 'Program', strong: true },
            { key: 'enrolled', label: 'Students', width: '100px', mono: true, align: 'right' },
          ]}
        />
      </Card>
    </div>
  );
}
