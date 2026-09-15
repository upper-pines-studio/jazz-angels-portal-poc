import React from 'react';
import {
  Avatar, Badge, Button, Card, DataTable, EmptyState, Field, Icon, Input, Select, Tabs, Tag,
} from '../../../design-system';
import { usePageHeader } from '../../../app/Shell';
import { Eyebrow, KV } from '../../../app/components/badges';
import { TableScroll } from '../../../app/components/TableScroll';
import { programName, useStore } from '../../../core';
import type { ProgramId } from '../../../core';
import {
  attendanceRateForStudent, ensembleById, enrolledCount, percent, termForDate,
} from '../domain';
import type { Mark, Student } from '../domain';
import { MarkDots, TONE_COLOR } from './parts';
import EnrollStudentDialog from './students/EnrollStudentDialog';

const ALL = 'all';
const WAITLIST = 'waitlist';

const STATUS_TONE = { enrolled: 'teal', waitlist: 'neutral', alumni: 'blue' } as const;
const STATUS_LABEL = { enrolled: 'Enrolled', waitlist: 'Waitlist', alumni: 'Alumni' } as const;

export default function Students() {
  const { state, today } = useStore();

  const [tab, setTab] = React.useState<string>(ALL);
  const [q, setQ] = React.useState('');
  const [ensembleFilter, setEnsembleFilter] = React.useState(ALL);
  const [selectedId, setSelectedId] = React.useState<string | undefined>();
  const [enrolling, setEnrolling] = React.useState(false);

  const term = termForDate(state, today);
  const window = term ? { from: term.start, to: term.end } : undefined;

  usePageHeader({
    title: 'Students',
    subtitle: `${enrolledCount(state)} enrolled · ${state.teaching.students.filter((s) => s.status === 'waitlist').length} waiting`,
    actions: (
      <Button variant="primary" size="sm" iconLeft={<Icon name="user-plus" size={15} />} onClick={() => setEnrolling(true)}>
        Enroll student
      </Button>
    ),
  });

  /** Tabs: every student, then each program with somebody in it, then the waitlist. */
  const programsWithStudents = state.core.programs.filter((p) =>
    state.teaching.students.some((s) => s.status === 'enrolled' && s.programId === p.id),
  );
  const tabs = [
    { id: ALL, label: 'All students', count: enrolledCount(state) },
    ...programsWithStudents.map((p) => ({
      id: p.id,
      label: p.short,
      count: enrolledCount(state, p.id),
    })),
    { id: WAITLIST, label: 'Waitlist', count: state.teaching.students.filter((s) => s.status === 'waitlist').length },
  ];

  const inTab = (s: Student) =>
    tab === WAITLIST ? s.status === 'waitlist' : s.status === 'enrolled' && (tab === ALL || s.programId === tab);

  const needle = q.trim().toLowerCase();
  const rows = state.teaching.students
    .filter(inTab)
    .filter((s) => ensembleFilter === ALL || s.ensembleId === ensembleFilter)
    .filter((s) => !needle
      || s.name.toLowerCase().includes(needle)
      || s.instrument.toLowerCase().includes(needle)
      || s.guardianName.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selected = state.teaching.students.find((s) => s.id === selectedId) ?? rows[0];

  /** This session's rate, or last session's in muted type where this one has no marks. */
  const attendanceCell = (s: Student) => {
    const thisTerm = window ? attendanceRateForStudent(state, s.id, window) : undefined;
    if (thisTerm !== undefined) return <span>{percent(thisTerm)}</span>;
    const everything = attendanceRateForStudent(state, s.id);
    if (everything === undefined) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
    return <span style={{ color: 'var(--text-muted)' }} title="Last session">{percent(everything)}</span>;
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
          subtitle={term ? `Attendance is ${term.name}, or last session where this one has no marks yet` : 'The whole roster'}
        >
          <div className="ja-filter-bar" style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: 'var(--border-width) solid var(--border-subtle)',
          }}>
            <div className="ja-filter-bar__search">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search students or guardians"
                prefix={<Icon name="search" size={15} />}
                style={{ width: '100%' }}
              />
            </div>
            <div className="ja-filter-bar__select">
              <Select
                value={ensembleFilter}
                onChange={(e) => setEnsembleFilter(e.target.value)}
                options={[
                  { value: ALL, label: 'All ensembles' },
                  ...state.teaching.ensembles.map((e) => ({ value: e.id, label: e.name })),
                ]}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<Icon name="users" size={22} />}
              title="Nobody here yet"
              message="No students in this view yet. Enroll a student to add them to the roster."
              action={(
                <Button variant="primary" size="sm" iconLeft={<Icon name="user-plus" size={15} />} onClick={() => setEnrolling(true)}>
                  Enroll student
                </Button>
              )}
            />
          ) : (
            <TableScroll minWidth={880}>
              <DataTable
                rows={rows}
                onRowClick={(s: Student) => setSelectedId(s.id)}
                columns={[
                  {
                    key: 'name', label: 'Student', width: '1.6fr', strong: true,
                    render: (s: Student) => (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <Avatar name={s.name} size={24} />
                        {s.name}
                      </span>
                    ),
                  },
                  { key: 'instrument', label: 'Instrument', width: '1.1fr', render: (s: Student) => s.instrument },
                  {
                    key: 'ensemble', label: 'Ensemble', width: '1.1fr',
                    render: (s: Student) => {
                      const e = ensembleById(state, s.ensembleId);
                      return e
                        ? <span>{e.name}</span>
                        : <span style={{ color: 'var(--text-faint)' }}>Not placed</span>;
                    },
                  },
                  {
                    key: 'guardian', label: 'Guardian', width: '1.2fr',
                    render: (s: Student) => <span style={{ color: 'var(--text-muted)' }}>{s.guardianName}</span>,
                  },
                  { key: 'attendance', label: 'Attendance', width: '110px', mono: true, align: 'right', render: attendanceCell },
                  {
                    key: 'status', label: 'Status', width: '110px',
                    render: (s: Student) => <Badge tone={STATUS_TONE[s.status]} dot>{STATUS_LABEL[s.status]}</Badge>,
                  },
                ]}
              />
            </TableScroll>
          )}
        </Card>

        {selected
          ? <StudentCard student={selected} />
          : (
            <Card padding="0">
              <EmptyState
                icon={<Icon name="user" size={22} />}
                title="No student selected"
                message="Pick a row on the left and their contact details and attendance show up here."
              />
            </Card>
          )}
      </div>

      {enrolling && (
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

function StudentCard({ student }: { student: Student }) {
  const { state, today, actions } = useStore();
  const ensemble = ensembleById(state, student.ensembleId);
  const term = termForDate(state, today);

  const thisTerm = term
    ? attendanceRateForStudent(state, student.id, { from: term.start, to: term.end })
    : undefined;
  const allTime = attendanceRateForStudent(state, student.id);

  // The last five marks anywhere, oldest first, as a row of dots.
  const dateOf = new Map(state.teaching.meetings.map((m) => [m.id, `${m.date} ${m.start}`]));
  const recent: Mark[] = state.teaching.attendance
    .filter((a) => a.studentId === student.id)
    .sort((a, b) => (dateOf.get(a.meetingId) ?? '').localeCompare(dateOf.get(b.meetingId) ?? ''))
    .slice(-5)
    .map((a) => a.mark);

  const ensembles = state.teaching.ensembles.filter((e) => e.programId === student.programId);

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
            <div style={{
              font: 'var(--weight-semibold) var(--text-lg)/1.2 var(--font-display)',
              letterSpacing: 'var(--tracking-display)', color: 'var(--text-strong)',
            }}>
              {student.name}
            </div>
            <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
              {`${student.instrument} · year ${student.yearsIn}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', margin: 'var(--space-5) 0' }}>
          <Tag>{student.instrument}</Tag>
          {ensemble && <Tag color={TONE_COLOR[ensemble.tone]}>{ensemble.name}</Tag>}
          <Badge tone={STATUS_TONE[student.status]} dot>{STATUS_LABEL[student.status]}</Badge>
        </div>

        <div>
          <KV k="Guardian" v={student.guardianName} />
          <KV k="Phone" v={student.guardianPhone ?? 'Not on file'} />
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

      <Card title="Placement" subtitle="Moving a student takes effect on the next roll call" padding="var(--space-5)">
        <Field label="Ensemble">
          <Select
            value={student.ensembleId ?? WAITLIST_OPTION}
            onChange={(e) => move(e.target.value)}
            options={[
              { value: WAITLIST_OPTION, label: 'Waitlist' },
              ...ensembles.map((e) => ({ value: e.id, label: `${e.name} · ${e.room}` })),
            ]}
            style={{ width: '100%' }}
          />
        </Field>
      </Card>
    </div>
  );
}
