import { Icon } from '../../../design-system';
import { dateShort, staffById, useStore } from '../../../core';
import type { TimeEntry } from '../domain';

/**
 * How a sent-back entry reads to the person who logged it, and to the office:
 * who sent it back, when, and what they said needs fixing. Shown under the
 * activity in the week table and at the top of Edit hours, until the entry is
 * submitted again.
 */

/** "Sent back by Keisha Grant on Sep 13". */
export function sentBackBy(name: string | undefined, entry: TimeEntry): string {
  return `Sent back${name ? ` by ${name}` : ''}${entry.sentBackAt ? ` on ${dateShort(entry.sentBackAt)}` : ''}`;
}

/** One line in the table, or a block in a dialog. Renders nothing without a reason. */
export function SentBackNote({ entry, block = false }: { entry: TimeEntry; block?: boolean }) {
  const { state } = useStore();
  if (!entry.sentBackReason) return null;
  const who = sentBackBy(staffById(state, entry.sentBackBy)?.name, entry);
  return (
    <span className={block ? 'ja-ts-sentback ja-ts-sentback--block' : 'ja-ts-sentback'}>
      <Icon name="undo-2" size={13} color="var(--gold-700)" />
      <span>
        <strong>{who}:</strong> {entry.sentBackReason}
      </span>
    </span>
  );
}
