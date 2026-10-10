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
import { useToast } from '../../../app/ToastHost';
import {
  ArchiveButton,
  ArchiveDialog,
  ArchivedName,
  ArchivedNotice,
  ShowArchivedSwitch,
  useArchivedParam,
} from '../../../app/components/archive';
import {
  activeOnly,
  cell,
  dateLong,
  isArchived,
  pickable,
  placeLabel,
  programName,
  staffById,
  useCan,
  useStore,
} from '../../../core';
import type { ProgramId } from '../../../core';
import {
  PHOTO_RELEASE_LABEL,
  attendanceRateForStudent,
  ensembleById,
  ensembleCount,
  enrolledCount,
  hasNoPhotoRelease,
  leadsEnsemble,
  percent,
  photoReleaseRefusal,
  rosterFor,
  termForDate,
  waitlistCount,
} from '../domain';
import type { Mark, PhotoRelease, PhotoReleaseInput, RosterStudent } from '../domain';
import { MarkDots, TONE_COLOR } from './parts';
import EnrollStudentDialog from './students/EnrollStudentDialog';
import ImportStudentsDialog from './students/ImportStudentsDialog';
import PhotoReleaseFields from './students/PhotoReleaseFields';

const ALL = 'all';
const WAITLIST = 'waitlist';

const STATUS_TONE = { enrolled: 'teal', waitlist: 'neutral', alumni: 'blue' } as const;
const STATUS_LABEL = { enrolled: 'Enrolled', waitlist: 'Waitlist', alumni: 'Alumni' } as const;

/** The roster's photo release filter: everyone, or only who must stay out of photos. */
const NO_RELEASE = 'no-release';

/**
 * A photo release as the roster and the card show it. Given is plain text;
 * Not given and Not asked yet are badges, since those students must stay out
 * of photos.
 */
function PhotoReleaseMark({ release }: { release: PhotoRelease }) {
  if (release.status === 'given')
    return <span style={{ color: 'var(--text-muted)' }}>{PHOTO_RELEASE_LABEL.given}</span>;
  return (
    <Badge tone={release.status === 'not-given' ? 'danger' : 'gold'} dot>
      {PHOTO_RELEASE_LABEL[release.status]}
    </Badge>
  );
}

/** "Given · Sep 6, 2026", "Not given · Sep 6, 2026", or "Not asked yet". */
function releaseSummary(release: PhotoRelease): string {
  const label = PHOTO_RELEASE_LABEL[release.status];
  return release.status !== 'not-asked' && release.date
    ? `${label} · ${dateLong(release.date)}`
    : label;
}

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
  // ?archived=1 lists the archived students of the tab after the current ones.
  const [showArchived, setShowArchived] = useArchivedParam();
  const students = rosterFor(state, user, showArchived);
  // Archived students are never counted: the numbers are the roster as it stands.
  const current = students.filter(s => !isArchived(s));
  const enrolledIn = (programId?: ProgramId) =>
    current.filter(s => s.status === 'enrolled' && (!programId || s.programId === programId))
      .length;
  const waiting = current.filter(s => s.status === 'waitlist').length;

  const [tab, setTab] = React.useState<string>(ALL);
  const [q, setQ] = React.useState('');
  const [ensembleFilter, setEnsembleFilter] = React.useState(ALL);
  const [releaseFilter, setReleaseFilter] = React.useState(ALL);
  const [selectedId, setSelectedId] = React.useState<string | undefined>();
  const [enrolling, setEnrolling] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  const term = termForDate(state, today);
  const window = term ? { from: term.start, to: term.end } : undefined;

  usePageHeader({
    title: 'Students',
    subtitle: ownOnly
      ? `${enrolledIn()} in your classes`
      : `${enrolledIn()} enrolled · ${waiting} waiting`,
    actions: mayEdit ? (
      <div className="ja-actions">
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="upload" size={15} />}
          onClick={() => setImporting(true)}
        >
          Import
        </Button>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Icon name="user-plus" size={15} />}
          onClick={() => setEnrolling(true)}
        >
          Enroll student
        </Button>
      </div>
    ) : undefined,
  });

  /** Tabs: every student, then each program with somebody in it, then the waitlist. */
  const programsWithStudents = state.core.programs.filter(p =>
    current.some(s => s.status === 'enrolled' && s.programId === p.id),
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
  const ensembles = activeOnly(state.teaching.ensembles).filter(
    e => !ownOnly || leadsEnsemble(state, user, e.id),
  );

  const inTab = (s: RosterStudent) =>
    tab === WAITLIST
      ? s.status === 'waitlist'
      : s.status === 'enrolled' && (tab === ALL || s.programId === tab);

  const needle = q.trim().toLowerCase();
  const archivedInTab = rosterFor(state, user, true).filter(s => isArchived(s) && inTab(s)).length;
  const inEnsemble = (s: RosterStudent) =>
    ensembleFilter === ALL || s.ensembleId === ensembleFilter;
  // How many in this tab and ensemble have no release, for the filter's label.
  const withoutRelease = students.filter(
    s => inTab(s) && inEnsemble(s) && hasNoPhotoRelease(s),
  ).length;
  const rows = students
    .filter(inTab)
    .filter(inEnsemble)
    .filter(s => releaseFilter === ALL || hasNoPhotoRelease(s))
    .filter(
      s =>
        !needle ||
        s.name.toLowerCase().includes(needle) ||
        s.instrument.toLowerCase().includes(needle) ||
        !!s.guardianName?.toLowerCase().includes(needle),
    )
    .sort((a, b) => Number(isArchived(a)) - Number(isArchived(b)) || a.name.localeCompare(b.name));

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
            {showGuardian && (
              <div className="ja-filter-bar__select">
                <Select
                  value={releaseFilter}
                  onChange={e => setReleaseFilter(e.target.value)}
                  aria-label="Photo release"
                  options={[
                    { value: ALL, label: 'All photo releases' },
                    { value: NO_RELEASE, label: `No photo release (${withoutRelease})` },
                  ]}
                  style={{ width: '100%' }}
                />
              </div>
            )}
            <ShowArchivedSwitch
              count={archivedInTab}
              checked={showArchived}
              onChange={setShowArchived}
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<Icon name="users" size={22} />}
              title={
                releaseFilter === NO_RELEASE ? 'Everyone here has a release' : 'Nobody here yet'
              }
              message={
                releaseFilter === NO_RELEASE
                  ? 'Every student in this view has a photo release given, so anyone here can be in photos.'
                  : mayEdit
                    ? 'No students in this view yet. Enroll a student to add them to the roster.'
                    : 'No students in this view yet.'
              }
              action={
                mayEdit && releaseFilter !== NO_RELEASE ? (
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
            <TableScroll minWidth={showGuardian ? 1010 : 880}>
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
                        // The release follows guardian contacts (decision 0001).
                        {
                          key: 'photoRelease',
                          label: 'Photo release',
                          width: '130px',
                          render: (s: RosterStudent) =>
                            s.photoRelease ? <PhotoReleaseMark release={s.photoRelease} /> : null,
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
                    // Archived is not a status: an archived student keeps theirs, and the
                    // Archived badge sits under it.
                    render: (s: RosterStudent) => (
                      <ArchivedName
                        record={s}
                        name={
                          <Badge tone={STATUS_TONE[s.status]} dot>
                            {STATUS_LABEL[s.status]}
                          </Badge>
                        }
                      />
                    ),
                  },
                ]}
              />
            </TableScroll>
          )}
        </Card>

        {selected ? (
          <StudentCard
            student={selected}
            mayEdit={mayEdit}
            onKeep={() => setSelectedId(selected.id)}
          />
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
      {importing && mayEdit && <ImportStudentsDialog open onClose={() => setImporting(false)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// The selected student
// ---------------------------------------------------------------------------

const WAITLIST_OPTION = '__waitlist__';

function StudentCard({
  student,
  mayEdit,
  onKeep,
}: {
  student: RosterStudent;
  mayEdit: boolean;
  /** Keep this student on the card when a change takes them out of the filtered list. */
  onKeep: () => void;
}) {
  const { state, today, actions } = useStore();
  const toast = useToast();
  const [archiving, setArchiving] = React.useState(false);
  const archived = isArchived(student);
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

  const ensembles = pickable(state.teaching.ensembles, student.ensembleId).filter(
    e => e.programId === student.programId,
  );

  const move = (next: string) => {
    if (next === WAITLIST_OPTION) {
      actions.teaching.updateStudent(student.id, { ensembleId: undefined, status: 'waitlist' });
    } else {
      actions.teaching.updateStudent(student.id, { ensembleId: next, status: 'enrolled' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <ArchivedNotice
        record={student}
        detail="Off the roster, the roll call and the counts. Their attendance is all here."
        onRestore={
          mayEdit
            ? () => {
                actions.teaching.restoreStudent(student.id);
                toast({
                  tone: 'success',
                  title: 'Student restored',
                  message: `${student.name} is back on the roster.`,
                });
              }
            : undefined
        }
      />
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
          {student.photoRelease && (
            <KV k="Photo release" v={releaseSummary(student.photoRelease)} />
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

        {mayEdit && !archived && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-5)' }}>
            <ArchiveButton onClick={() => setArchiving(true)} />
          </div>
        )}
      </Card>

      {archiving && mayEdit && (
        <ArchiveDialog
          title={`Archive ${student.name}?`}
          message="They leave the roster, the roll call and the counts. Their past attendance stays, and so does their status. You can restore them."
          onConfirm={() => {
            actions.teaching.archiveStudent(student.id);
            toast({
              tone: 'success',
              title: 'Student archived',
              message: `${student.name} is off the roster. Restore them from Show archived.`,
            });
          }}
          onClose={() => setArchiving(false)}
        />
      )}

      {mayEdit && !archived && (
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

      {mayEdit && !archived && student.photoRelease && (
        <PhotoReleaseCard
          key={student.id}
          studentId={student.id}
          name={student.name}
          release={student.photoRelease}
          onSave={onKeep}
        />
      )}
    </div>
  );
}

/**
 * Record a guardian's answer on photos: Given or Not given on a date, or back
 * to Not asked yet. Shown to whoever may edit the student; the store stamps
 * who recorded it.
 */
function PhotoReleaseCard({
  studentId,
  name,
  release,
  onSave,
}: {
  studentId: string;
  name: string;
  release: PhotoRelease;
  onSave: () => void;
}) {
  const { state, today, actions, whenSaved } = useStore();
  const toast = useToast();
  const saved: PhotoReleaseInput = { status: release.status, date: release.date };
  const [draft, setDraft] = React.useState<PhotoReleaseInput>(saved);
  const [showErrors, setShowErrors] = React.useState(false);
  const error = photoReleaseRefusal(draft, today);
  const changed =
    draft.status !== release.status ||
    (draft.status !== 'not-asked' && (draft.date ?? today) !== release.date);
  const recorder = staffById(state, release.recordedById);

  const save = async () => {
    if (error) {
      setShowErrors(true);
      return;
    }
    // A release given under "No photo release" takes them off the list; the card stays on them.
    onSave();
    actions.teaching.setPhotoRelease(studentId, draft);
    if (!(await whenSaved())) return; // the store has said it could not save
    setShowErrors(false);
    toast({
      tone: 'success',
      title: 'Photo release saved',
      message:
        draft.status === 'given'
          ? `${name} can be in photos for reports.`
          : draft.status === 'not-given'
            ? `${name} stays out of photos.`
            : `${name} stays out of photos until a guardian answers.`,
    });
  };

  return (
    <Card
      title="Photo release"
      subtitle="Whether a guardian agreed to photos of this student in reports"
      padding="var(--space-5)"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <PhotoReleaseFields
          value={draft}
          onChange={setDraft}
          today={today}
          error={showErrors ? error : undefined}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)' }}>
            {release.status !== 'not-asked' && recorder
              ? `Recorded by ${recorder.name}`
              : 'Nobody has recorded an answer yet.'}
          </span>
          <Button variant="primary" size="sm" disabled={!changed} onClick={save}>
            Save release
          </Button>
        </div>
      </div>
    </Card>
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
  const waiting = waitlistCount(state);

  usePageHeader({
    title: 'Students',
    subtitle: `${enrolledCount(state)} enrolled · ${waiting} waiting`,
  });

  const programs = state.core.programs
    .map(p => ({ id: p.id, name: p.name, enrolled: enrolledCount(state, p.id) }))
    .filter(p => p.enrolled > 0);
  const ensembles = activeOnly(state.teaching.ensembles).map(e => ({
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
        {ensembles.length === 0 ? (
          <EmptyState
            icon={<Icon name="users" size={22} />}
            title="No ensembles yet"
            message="How many students each ensemble has shows up here once the office sets up the term's ensembles and enrolls students."
          />
        ) : (
          <TableScroll minWidth={560}>
            <DataTable
              rows={ensembles}
              columns={[
                { key: 'name', label: 'Ensemble', width: '1.4fr', strong: true },
                { key: 'program', label: 'Program', width: '1.4fr' },
                { key: 'place', label: 'Where', width: '1.4fr' },
                { key: 'enrolled', label: 'Enrolled', width: '100px', mono: true, align: 'right' },
              ]}
            />
          </TableScroll>
        )}
      </Card>
      <Card padding="0" title="By program">
        {programs.length === 0 && waiting === 0 ? (
          <EmptyState
            style={{ padding: 'var(--space-6) var(--space-5)' }}
            title="No students yet"
            message="Each program's student count shows up here once students are enrolled."
          />
        ) : (
          <DataTable
            rows={[...programs, { id: 'waitlist', name: 'Waitlist', enrolled: waiting }]}
            columns={[
              { key: 'name', label: 'Program', strong: true },
              { key: 'enrolled', label: 'Students', width: '100px', mono: true, align: 'right' },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
