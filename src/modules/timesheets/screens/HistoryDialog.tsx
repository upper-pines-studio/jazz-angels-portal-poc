import { format } from 'date-fns';
import { Button, Dialog } from '../../../design-system';
import { dateLong, dateShort, programName, staffById, toDate, useStore } from '../../../core';
import type { PortalState } from '../../../core';
import { formatHours, hasRebuiltHistory, historyLines } from '../domain';
import type { HistoryLine, TimeEntry, TimeEntryFieldChanges } from '../domain';

/**
 * An entry's history, oldest first, in plain words: "Approved by Keisha
 * Monroe, Sep 13", "Sent back by Keisha Monroe, Sep 14: wrong date" (#95).
 * Opened from the entry's status in the week table, for the person who logged
 * it and the roles that approve hours.
 */

/** "Wed Sep 9". */
function weekday(iso: string): string {
  return format(toDate(iso), 'EEE MMM d');
}

/** "Sep 13" this year, "Mar 2, 2025" before it. */
function when(iso: string, today: string): string {
  return iso.slice(0, 4) === today.slice(0, 4) ? dateShort(iso) : dateLong(iso);
}

const VERB: Record<HistoryLine['event']['kind'], string> = {
  logged: 'Logged',
  changed: 'Changed',
  submitted: 'Submitted',
  recalled: 'Recalled',
  approved: 'Approved',
  'sent-back': 'Sent back',
};

/** "hours 1.25 to 1.50, day Wed Sep 9 to Tue Sep 8". */
function describeChanges(state: PortalState, changes: TimeEntryFieldChanges): string {
  const parts: string[] = [];
  if (changes.date) parts.push(`day ${weekday(changes.date.from)} to ${weekday(changes.date.to)}`);
  if (changes.hours) {
    parts.push(`hours ${formatHours(changes.hours.from)} to ${formatHours(changes.hours.to)}`);
  }
  if (changes.programId) {
    parts.push(
      `program ${programName(state, changes.programId.from)} to ${programName(state, changes.programId.to)}`,
    );
  }
  if (changes.activity) parts.push(`activity now “${changes.activity.to}”`);
  if (changes.ensembleId && !changes.activity) parts.push('ensemble');
  return parts.join(', ');
}

/** The step's sentence: "Approved again by Keisha Monroe, Sep 16". */
export function historySentence(state: PortalState, today: string, line: HistoryLine): string {
  const { event, again } = line;
  const who = staffById(state, event.whoId)?.name ?? 'someone no longer on the staff list';
  const head = `${VERB[event.kind]}${again ? ' again' : ''} by ${who}${event.at ? `, ${when(event.at, today)}` : ''}`;
  const detail =
    event.kind === 'sent-back'
      ? event.reason
      : event.kind === 'changed' && event.changes
        ? describeChanges(state, event.changes)
        : '';
  return detail ? `${head}: ${detail}` : head;
}

export default function HistoryDialog({
  entry,
  onClose,
}: {
  entry: TimeEntry;
  onClose: () => void;
}) {
  const { state, today } = useStore();
  const lines = historyLines(entry);
  const name = staffById(state, entry.staffId)?.name ?? 'Unknown';
  return (
    <Dialog
      open
      width={500}
      title="History"
      description={`${weekday(entry.date)}, ${name}, ${entry.activity}, ${formatHours(entry.hours)} hours.`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <ol className="ja-ts-history" aria-label="Every step, oldest first">
        {lines.map((line, i) => (
          <li
            key={line.event.id}
            className={
              i === lines.length - 1
                ? 'ja-ts-history__step ja-ts-history__step--now'
                : 'ja-ts-history__step'
            }
          >
            {historySentence(state, today, line)}
          </li>
        ))}
      </ol>
      {hasRebuiltHistory(entry) && (
        <p className="ja-ts-history__note">
          These hours were saved before the portal kept every step, so this is rebuilt from what the
          entry recorded. A step without a date is one whose day was not kept.
        </p>
      )}
    </Dialog>
  );
}
