import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState, Icon } from '../../../../design-system';
import { dateRange, programName, useStore } from '../../../../core';
import type { PortalState, ProgramId } from '../../../../core';
import { isPostAward } from '../../domain';
import type { Grant } from '../../domain';
import { attendanceSummary } from '../../../teaching';
import { hoursByProgram, hoursForProgram } from '../../../timesheets';
import './grant.css';

/**
 * What the next report will need, already counted: roll call from Teaching and
 * teaching-artist hours from Timesheets, over the grant's period up to today.
 *
 * Both modules are read through their public API and nothing deeper. A general
 * operating grant pays for the whole studio, so it counts every program; any
 * other grant is narrowed to the one it funds.
 */

interface Numbers {
  meetings: number;
  studentsServed: number;
  attendanceRate: number;
  teachingHours: number;
}

function numbersFor(state: PortalState, programId: ProgramId | undefined, from: string, to: string): Numbers {
  const roll = attendanceSummary(state, { programId, from, to });
  const hours = programId
    ? hoursForProgram(state, programId, from, to)
    : hoursByProgram(state, { from, to }).reduce((sum, row) => sum + row.hours, 0);

  return {
    meetings: roll.meetings,
    studentsServed: roll.studentsServed,
    attendanceRate: roll.attendanceRate,
    teachingHours: hours,
  };
}

/** Which module each figure came from, and where the reader goes to see it. */
const SOURCE = {
  Teaching: '/schedule',
  Timesheets: '/timesheets',
} as const;

type Source = keyof typeof SOURCE;

export function ProgramNumbers({ grant }: { grant: Grant }) {
  const { state, today } = useStore();
  const nav = useNavigate();

  // Nothing to count until the funder has said yes and the period is set.
  const from = grant.dates.periodStart;
  if (!isPostAward(grant.phase) || !from) return null;

  const end = grant.dates.periodEnd;
  const to = end && end < today ? end : today;

  // General operating pays for everything, so it is not narrowed to a program.
  const wholeStudio = grant.program === 'general-operating';
  const scope = wholeStudio ? 'All programs' : programName(state, grant.program);

  const off = ['teaching', 'timesheets'].filter(id => !state.core.settings.enabledModules.includes(id));
  const numbers = off.length === 0 ? numbersFor(state, wholeStudio ? undefined : grant.program, from, to) : undefined;
  const counted = numbers && numbers.meetings > 0;

  const stats: Array<[label: string, value: string, source: Source]> = numbers ? [
    ['Meetings held', String(numbers.meetings), 'Teaching'],
    ['Students served', String(numbers.studentsServed), 'Teaching'],
    ['Attendance', `${Math.round(numbers.attendanceRate * 100)}%`, 'Teaching'],
    ['Teaching hours', numbers.teachingHours.toFixed(2), 'Timesheets'],
  ] : [];

  return (
    <Card
      title="Program numbers"
      subtitle="What the next report will need, already counted."
      padding={counted ? 'var(--space-4) var(--space-6) var(--space-5)' : '0'}
    >
      {off.length > 0 && <ModulesOff off={off} onSettings={() => nav('/settings')} />}

      {numbers && !counted && (
        <EmptyState icon={<Icon name="calendar" size={22} />} title="No numbers yet"
          message={`Numbers appear here once roll call is taken for ${scope}.`} />
      )}

      {counted && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <span style={{
            font: 'var(--type-eyebrow)', letterSpacing: 'var(--tracking-caps)',
            textTransform: 'uppercase', color: 'var(--teal-500)',
          }}>
            {`From roll call and timesheets · ${scope} · ${dateRange(from, to)}`}
          </span>

          <div className="ja-program-numbers">
            {stats.map(([label, value, source]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                <span style={{
                  font: 'var(--type-eyebrow)', letterSpacing: 'var(--tracking-caps)',
                  textTransform: 'uppercase', color: 'var(--text-muted)',
                }}>
                  {label}
                </span>
                <span style={{
                  font: 'var(--weight-semibold) var(--text-2xl)/1 var(--font-display)',
                  letterSpacing: 'var(--tracking-display)', color: 'var(--text-strong)',
                }}>
                  {value}
                </span>
                <Button variant="link" size="sm" onClick={() => nav(SOURCE[source])}>{source}</Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Teaching or Timesheets is switched off in Settings, so the numbers are not there to read. */
function ModulesOff({ off, onSettings }: { off: string[]; onSettings: () => void }) {
  const both = off.length === 2;
  const names = both ? 'Teaching and Timesheets' : off[0] === 'teaching' ? 'Teaching' : 'Timesheets';
  const message = both
    ? 'Turn on Teaching and Timesheets in Settings to see these numbers here.'
    : off[0] === 'teaching'
      ? 'Turn on Teaching in Settings to see roll-call numbers here.'
      : 'Turn on Timesheets in Settings to see teaching-hour numbers here.';

  return (
    <EmptyState icon={<Icon name="settings" size={22} />}
      title={`${names} ${both ? 'are' : 'is'} turned off`}
      message={message}
      action={<Button variant="secondary" size="sm" onClick={onSettings}>Open Settings</Button>} />
  );
}
