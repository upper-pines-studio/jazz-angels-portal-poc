import type { SliceTables } from '../../../core/rows';
import { dayFrom, groupBy, orNull, withoutNulls } from '../../../core/rows';
import type {
  TimeEntry,
  TimeEntryEvent,
  TimeEntryEventKind,
  TimeEntryFieldChanges,
  TimeEntryStatus,
  TimesheetsState,
} from './types';

/**
 * Timesheets' state as the rows of its tables in `docs/SCHEMA.md`, and back
 * (#121). An entry is one `time_entries` row; each step of its history is one
 * `activity` row with subject kind `time-entry` ("Links across modules"),
 * whose `kind` and `detail` keep the step as it was recorded and whose `text`
 * says it in words for whoever reads the table.
 */

export type TimeEntryRow = {
  id: string;
  staff_id: string;
  date: string;
  program_id: string;
  ensemble_id: string | null;
  activity: string;
  hours: number;
  status: TimeEntryStatus;
  approved_by: string | null;
  approved_at: string | null;
  sent_back_by: string | null;
  sent_back_at: string | null;
  sent_back_reason: string | null;
};

/** What a step carries beyond its kind, who and when. `null` when it carries nothing. */
export type TimeEntryStepDetail = {
  reason?: string;
  changes?: TimeEntryFieldChanges;
  /** Rebuilt from an entry saved before #95. */
  rebuilt?: true;
  /** The step had no date; `at` is the entry's own date (SCHEMA.md). */
  undated?: true;
};

export type TimeEntryActivityRow = {
  id: string;
  subject_kind: 'time-entry';
  subject_id: string;
  at: string;
  who_id: string;
  who: null;
  text: string;
  kind: TimeEntryEventKind;
  detail: TimeEntryStepDetail | null;
};

export type TimesheetsTables = {
  time_entries: TimeEntryRow[];
  activity: TimeEntryActivityRow[];
};

const STEP_WORDS: Record<TimeEntryEventKind, string> = {
  logged: 'Logged',
  changed: 'Changed',
  submitted: 'Submitted',
  recalled: 'Recalled',
  approved: 'Approved',
  'sent-back': 'Sent back',
};

const FIELD_WORDS: Record<keyof TimeEntryFieldChanges, string> = {
  date: 'day',
  hours: 'hours',
  programId: 'program',
  activity: 'activity',
  ensembleId: 'class',
};

/**
 * A step in words, as SCHEMA.md gives them: "Approved", "Sent back: reason",
 * "Changed: hours 1.25 to 1.50". Only for reading the table; the screens read
 * the step's kind and detail.
 */
export function stepText(event: TimeEntryEvent): string {
  const words = STEP_WORDS[event.kind];
  if (event.kind === 'sent-back' && event.reason) return `${words}: ${event.reason}`;
  if (event.kind === 'changed' && event.changes) {
    const fields = (Object.keys(event.changes) as Array<keyof TimeEntryFieldChanges>).map(key => {
      const hours = key === 'hours' ? event.changes?.hours : undefined;
      return hours ? `hours ${hours.from.toFixed(2)} to ${hours.to.toFixed(2)}` : FIELD_WORDS[key];
    });
    if (fields.length > 0) return `${words}: ${fields.join(', ')}`;
  }
  return words;
}

function stepRow(entry: TimeEntry, event: TimeEntryEvent): TimeEntryActivityRow {
  const detail: TimeEntryStepDetail = withoutNulls({
    reason: event.reason,
    changes: event.changes,
    rebuilt: event.rebuilt,
    undated: event.at === undefined ? (true as const) : undefined,
  });
  return {
    id: event.id,
    subject_kind: 'time-entry',
    subject_id: entry.id,
    at: event.at ?? entry.date,
    who_id: event.whoId,
    who: null,
    text: stepText(event),
    kind: event.kind,
    detail: Object.keys(detail).length > 0 ? detail : null,
  };
}

function stepFrom(row: TimeEntryActivityRow): TimeEntryEvent {
  const detail = row.detail ?? {};
  return {
    id: row.id,
    kind: row.kind,
    whoId: row.who_id,
    ...(detail.undated ? {} : { at: dayFrom(row.at) }),
    ...withoutNulls({ reason: detail.reason, changes: detail.changes, rebuilt: detail.rebuilt }),
  };
}

export const timesheetsTables: SliceTables<TimesheetsState, TimesheetsTables> = {
  keys: {
    time_entries: ['id'],
    activity: ['id'],
  },

  toRows(state) {
    return {
      time_entries: state.entries.map(e => ({
        id: e.id,
        staff_id: e.staffId,
        date: e.date,
        program_id: e.programId,
        ensemble_id: orNull(e.ensembleId),
        activity: e.activity,
        hours: e.hours,
        status: e.status,
        approved_by: orNull(e.approvedBy),
        approved_at: orNull(e.approvedAt),
        sent_back_by: orNull(e.sentBackBy),
        sent_back_at: orNull(e.sentBackAt),
        sent_back_reason: orNull(e.sentBackReason),
      })),
      activity: state.entries.flatMap(e => e.history.map(event => stepRow(e, event))),
    };
  },

  fromRows(tables) {
    // Grants writes `activity` too; only the time entries' steps are ours.
    const steps = groupBy(
      tables.activity.filter(r => r.subject_kind === 'time-entry'),
      'subject_id',
    );
    return {
      entries: tables.time_entries.map(r => ({
        id: r.id,
        staffId: r.staff_id,
        date: r.date,
        programId: r.program_id,
        activity: r.activity,
        hours: r.hours,
        status: r.status,
        ...withoutNulls({
          ensembleId: r.ensemble_id,
          approvedBy: r.approved_by,
          approvedAt: r.approved_at,
          sentBackBy: r.sent_back_by,
          sentBackAt: r.sent_back_at,
          sentBackReason: r.sent_back_reason,
        }),
        history: (steps.get(r.id) ?? []).map(stepFrom),
      })),
    };
  },
};
