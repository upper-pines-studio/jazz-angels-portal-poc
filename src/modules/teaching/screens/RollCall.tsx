import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Textarea,
} from '../../../design-system';
import { usePageHeader } from '../../../app/Shell';
import { Eyebrow, KV, OwnerAvatar } from '../../../app/components/badges';
import { useToast } from '../../../app/ToastHost';
import { dateShort, placeLabel, staffById, toDate, useStore, venueById } from '../../../core';
import {
  attendanceForMeeting,
  ensembleById,
  ensembleTrend,
  markCounts,
  meetingById,
  percent,
  rollCounts,
  rollMarks,
  rosterForEnsemble,
  timeLabel,
  timeRange,
} from '../domain';
import type { Mark } from '../domain';
import { MarkBadge } from './parts';
import './rollcall.css';

/** Everyone starts present, so the teacher only taps the exceptions. */
const MARK_OPTIONS: Array<{ value: Mark; label: string; icon: string }> = [
  { value: 'present', label: 'Present', icon: 'check' },
  { value: 'late', label: 'Late', icon: 'clock' },
  { value: 'absent', label: 'Absent', icon: 'x' },
];

export default function RollCall() {
  const { meetingId = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { state, today, actions, whenSaved } = useStore();

  const meeting = meetingById(state, meetingId);
  const ensemble = ensembleById(state, meeting?.ensembleId);
  const venue = venueById(state, meeting?.venueId);
  const roster = meeting ? rosterForEnsemble(state, meeting.ensembleId) : [];
  const records = meeting ? attendanceForMeeting(state, meeting.id) : [];
  const submitted = Boolean(meeting?.rollSubmittedAt);

  const [notes, setNotes] = React.useState(meeting?.notes ?? '');
  /**
   * The marks tapped on this screen, kept here as well as sent to the store,
   * so a save that fails (and is rolled back in the store) leaves them on
   * screen for Try again to send from (decision 0003).
   */
  const [tapped, setTapped] = React.useState<Map<string, Mark>>(() => new Map());
  /** What the last failed save was: the marks alone, or the whole submit. */
  const [failed, setFailed] = React.useState<'marks' | 'submit'>();
  const [sending, setSending] = React.useState(false);
  const [showNotesFor, setShowNotesFor] = React.useState(meetingId);
  if (showNotesFor !== meetingId) {
    // A different meeting: start its notes and marks from what is stored.
    setShowNotesFor(meetingId);
    setNotes(meeting?.notes ?? '');
    setTapped(new Map());
    setFailed(undefined);
  }

  // An open roll call counts the unmarked as present; a submitted one counts what was written down.
  // A mark tapped here counts too, saved or waiting on Try again.
  const marks = new Map([...rollMarks(roster, records), ...tapped]);
  const counts = submitted ? markCounts(records) : rollCounts(marks);

  usePageHeader({
    title: ensemble?.name ?? 'Roll call',
    subtitle: meeting
      ? `${format(toDate(meeting.date), 'EEEE, MMM d')} · ${timeLabel(meeting.start)} · ${placeLabel(state, meeting.venueId, meeting.room)}`
      : 'This class is not on the schedule',
    crumbs: [{ label: 'Schedule', href: '/schedule' }, { label: ensemble?.name ?? 'Roll call' }],
    actions: submitted ? (
      <Button
        variant="secondary"
        size="sm"
        iconLeft={<Icon name="pencil" size={15} />}
        onClick={() => meeting && actions.teaching.reopenRollCall(meeting.id)}
      >
        Edit roll call
      </Button>
    ) : undefined,
  });

  if (!meeting || !ensemble) {
    return (
      <Card padding="0">
        <EmptyState
          icon={<Icon name="calendar" size={22} />}
          title="That class is not on the schedule"
          message="Pick a class from the week grid to take its roll."
          action={
            <Button variant="secondary" size="sm" onClick={() => nav('/schedule')}>
              Open the schedule
            </Button>
          }
        />
      </Card>
    );
  }

  const markFor = (studentId: string): Mark | undefined =>
    submitted ? records.find(r => r.studentId === studentId)?.mark : marks.get(studentId);

  /** Send every mark tapped here; the store skips one that is already saved. */
  const sendMarks = () => {
    for (const [studentId, mark] of tapped) actions.teaching.setMark(meeting.id, studentId, mark);
  };

  // Tapping Late or Absent a second time puts the student back to present.
  const toggle = (studentId: string, option: Mark) => {
    const next = markFor(studentId) === option ? 'present' : option;
    setTapped(m => new Map(m).set(studentId, next));
    actions.teaching.setMark(meeting.id, studentId, next);
    void whenSaved().then(ok => {
      if (!ok) setFailed(f => f ?? 'marks');
    });
  };

  const submit = async () => {
    setFailed(undefined);
    setSending(true);
    // A mark that did not save goes again first, so the submit does not write that student down as present.
    sendMarks();
    actions.teaching.submitRollCall(meeting.id, notes.trim() || undefined);
    const ok = await whenSaved();
    setSending(false);
    if (!ok) {
      setFailed('submit');
      return;
    }
    toast({
      title: 'Roll call submitted',
      message: `${ensemble.name} · ${counts.present} present · ${counts.late} late · ${counts.absent} absent`,
    });
    nav('/schedule');
  };

  const tryAgain = async () => {
    if (failed === 'submit') return submit();
    setFailed(undefined);
    sendMarks();
    if (!(await whenSaved())) setFailed('marks');
  };

  const trend = ensembleTrend(state, ensemble.id, today);
  const lead = staffById(state, ensemble.leadStaffId);

  return (
    <div className="ja-split" style={{ gap: 'var(--space-4)' }}>
      <Card
        padding="0"
        title="Roster"
        subtitle={`${roster.length} ${roster.length === 1 ? 'student' : 'students'} · ${timeRange(meeting)}`}
        action={
          submitted ? (
            <Badge tone="teal" dot>
              Submitted
            </Badge>
          ) : undefined
        }
      >
        {roster.length === 0 ? (
          <EmptyState
            icon={<Icon name="users" size={22} />}
            title="Nobody on this roster yet"
            message={`The students in ${ensemble.name} show up here to mark present, late or absent. Enroll them on the Students screen first.`}
            action={
              <Button variant="secondary" size="sm" onClick={() => nav('/students')}>
                Open the roster
              </Button>
            }
          />
        ) : (
          roster.map(student => {
            const mark = markFor(student.id);
            return (
              <div key={student.id} className="ja-roll-row">
                <Avatar name={student.name} size={32} />
                <span className="ja-roll-who">
                  <span className="ja-roll-name" style={{ display: 'block' }}>
                    {student.name}
                  </span>
                  <span className="ja-roll-meta">
                    {`${student.instrument} · year ${student.yearsIn}`}
                  </span>
                </span>
                <span className="ja-roll-marks">
                  {submitted ? (
                    mark ? (
                      <MarkBadge mark={mark} />
                    ) : (
                      <Badge tone="neutral">Not marked</Badge>
                    )
                  ) : (
                    <span
                      className="ja-roll-toggle"
                      role="group"
                      aria-label={`${student.name}: mark`}
                    >
                      {MARK_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          className={`ja-roll-mark ja-roll-mark--${option.value}`}
                          aria-pressed={mark === option.value}
                          aria-label={option.label}
                          title={option.label}
                          onClick={() => toggle(student.id, option.value)}
                        >
                          <Icon name={option.icon} size={16} strokeWidth={2.5} />
                        </button>
                      ))}
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Card title="This roll call" padding="var(--space-5)">
          {!submitted && (
            <p
              style={{
                margin: '0 0 var(--space-4)',
                font: 'var(--type-body-sm)',
                color: 'var(--text-muted)',
              }}
            >
              Everyone starts present. Tap the clock for late or the cross for absent.
            </p>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Badge tone="teal" dot>{`${counts.present} present`}</Badge>
            <Badge tone="gold" dot>{`${counts.late} late`}</Badge>
            <Badge tone="danger" dot>{`${counts.absent} absent`}</Badge>
          </div>

          <div style={{ marginTop: 'var(--space-5)' }}>
            <KV k="Lead" v={lead?.name ?? '—'} />
            <KV k="Where" v={placeLabel(state, meeting.venueId, meeting.room)} />
            {venue && venue.kind !== 'studio' && venue.contactName && (
              <KV
                k="On site"
                v={[venue.contactName, venue.contactPhone].filter(Boolean).join(' · ')}
              />
            )}
            <KV
              k="Attendance"
              v={percent(
                counts.marked ? (counts.present + counts.late) / counts.marked : undefined,
              )}
              strong
            />
          </div>

          <div
            style={{
              marginTop: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            {submitted ? (
              <>
                <div>
                  <Eyebrow>Rehearsal notes</Eyebrow>
                  <p
                    style={{
                      margin: 'var(--space-2) 0 0',
                      font: 'var(--type-body-sm)',
                      color: meeting.notes ? 'var(--text-body)' : 'var(--text-faint)',
                    }}
                  >
                    {meeting.notes ?? 'No notes were written for this class.'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  fullWidth
                  iconLeft={<Icon name="pencil" size={16} />}
                  onClick={() => actions.teaching.reopenRollCall(meeting.id)}
                >
                  Edit roll call
                </Button>
              </>
            ) : (
              <>
                <Field
                  label="Rehearsal notes"
                  hint="What the band worked on. It goes on the class record."
                >
                  <Textarea
                    rows={4}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Ran the Autumn Leaves head, set the solo order."
                    style={{ width: '100%' }}
                  />
                </Field>
                {failed && (
                  <div
                    role="alert"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--danger-50)',
                      font: 'var(--type-body-sm)',
                      color: 'var(--danger-600)',
                    }}
                  >
                    <span style={{ flex: 1 }}>Couldn't save. Your marks are still here.</span>
                    <Button variant="secondary" size="sm" disabled={sending} onClick={tryAgain}>
                      Try again
                    </Button>
                  </div>
                )}
                <Button
                  variant="primary"
                  fullWidth
                  iconLeft={<Icon name="check" size={16} />}
                  disabled={roster.length === 0 || sending}
                  onClick={submit}
                >
                  Submit roll call
                </Button>
              </>
            )}
          </div>
        </Card>

        <Card
          title="Attendance trend"
          subtitle={
            trend.length === 0
              ? `${ensemble.name} · no classes yet`
              : `${ensemble.name} · last ${trend.length === 1 ? 'class' : `${trend.length} classes`}`
          }
          padding="var(--space-5)"
        >
          {trend.length === 0 ? (
            <EmptyState
              icon={<Icon name="trending-up" size={22} />}
              title="No history yet"
              message="Each submitted roll call adds a bar here, so you can see how the room is filling."
            />
          ) : (
            <div className="ja-roll-trend">
              {trend.map((point, i) => (
                <span key={point.meetingId} className="ja-roll-trend__col">
                  <span className="ja-roll-trend__value">{percent(point.rate)}</span>
                  <span
                    className={'ja-roll-trend__bar' + (i === trend.length - 1 ? ' is-latest' : '')}
                    style={{ height: `${Math.max(6, ((point.rate - 0.6) / 0.4) * 60 + 6)}px` }}
                  />
                  <span className="ja-roll-trend__date">{dateShort(point.date)}</span>
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card title="Who leads it" padding="var(--space-5)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <OwnerAvatar staffId={ensemble.leadStaffId} size={36} />
            <div>
              <div
                style={{
                  font: 'var(--weight-semibold) var(--text-sm)/1.3 var(--font-sans)',
                  color: 'var(--text-strong)',
                }}
              >
                {lead?.name ?? 'Unassigned'}
              </div>
              <div
                style={{
                  font: 'var(--type-body-sm)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                }}
              >
                {lead?.title ?? 'No lead on this ensemble yet'}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
