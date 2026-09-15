import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Button, Card, EmptyState, Icon } from '../../../design-system';
import { OwnerAvatar } from '../../../app/components/badges';
import { staffById, toDate, useStore } from '../../../core';
import {
  ensembleById, ensembleCount, nextMeeting, timeLabel, todaysMeetings,
} from '../domain';
import { RollBadge } from './parts';

/**
 * The teaching module's dashboard panel: what is happening in the studio
 * today, and the one button that matters for each of them.
 */
export function TodayPanel() {
  const nav = useNavigate();
  const { state, today } = useStore();

  const meetings = todaysMeetings(state, today);
  const next = nextMeeting(state, today);

  const nextLine = next
    ? `The next class is ${format(toDate(next.date), 'EEE MMM d')}, ${ensembleById(state, next.ensembleId)?.name ?? 'a class'} at ${timeLabel(next.start)}.`
    : 'Nothing else is on the schedule yet.';

  return (
    <Card
      title="Today's classes"
      subtitle={format(toDate(today), 'EEEE, MMM d')}
      padding="0"
      action={<Button variant="ghost" size="sm" onClick={() => nav('/schedule')}>Schedule</Button>}
    >
      {meetings.length === 0 ? (
        <EmptyState
          icon={<Icon name="calendar" size={22} />}
          title="No classes today"
          message={nextLine}
          action={<Button variant="secondary" size="sm" onClick={() => nav('/schedule')}>Open the schedule</Button>}
        />
      ) : (
        meetings.map((meeting, i) => {
          const ensemble = ensembleById(state, meeting.ensembleId);
          const lead = staffById(state, ensemble?.leadStaffId);
          const submitted = Boolean(meeting.rollSubmittedAt);
          return (
            <div
              key={meeting.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                padding: 'var(--space-4) var(--space-5)',
                borderTop: i === 0 ? 'none' : 'var(--border-width) solid var(--border-subtle)',
              }}
            >
              <span style={{
                font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)', flex: '0 0 auto', width: 56,
              }}>
                {timeLabel(meeting.start)}
              </span>

              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  display: 'block',
                  font: 'var(--weight-semibold) var(--text-sm)/1.3 var(--font-sans)',
                  color: 'var(--text-strong)',
                }}>
                  {ensemble?.name ?? 'Class'}
                </span>
                <span style={{ display: 'block', font: 'var(--text-xs)/1.4 var(--font-sans)', color: 'var(--text-muted)' }}>
                  {`${meeting.room} · ${lead?.name ?? 'No lead'} · ${ensembleCount(state, meeting.ensembleId)} students`}
                </span>
              </span>

              {submitted
                ? <RollBadge submitted due={false} />
                : (
                  <Button variant="ghost" size="sm" onClick={() => nav(`/roll/${meeting.id}`)}>
                    Take roll
                  </Button>
                )}

              <OwnerAvatar staffId={ensemble?.leadStaffId} size={24} />
            </div>
          );
        })
      )}
    </Card>
  );
}

export default TodayPanel;
