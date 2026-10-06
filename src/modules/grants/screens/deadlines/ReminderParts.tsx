import React from 'react';
import { Icon, Switch } from '../../../../design-system';
import { daysUntil, dateShort, useStore } from '../../../../core';
import type { PortalState } from '../../../../core';
import {
  DUE_SOON_DAYS,
  firstNames,
  funderById,
  funderShortName,
  grantById,
  offsetChip,
  reminderPlanFor,
  reminderSchedule,
} from '../../domain';
import type { Funder, Grant, ReminderPlan, ReminderStep, Report, ReportStatus } from '../../domain';
import './reminders.css';

/**
 * Pieces the report reminders share between Deadlines, a grant's Reports tab
 * and Settings: the chips, the recipients line and the wording of a report.
 * Schedules, saved or draft, come from the domain (`planSchedule`).
 */

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export function kindWord(report: Report): string {
  return report.kind === 'final' ? 'Final' : 'Interim';
}

/** The report's own progress, under its due badge. */
export const REPORT_STATUS_WORD: Record<ReportStatus, string> = {
  upcoming: 'Not started',
  drafting: 'Drafting',
  submitted: 'Submitted',
  accepted: 'Accepted',
};

export interface ReportContext {
  grant?: Grant;
  funder?: Funder;
  /** "LA County", "Herb Alpert". */
  funderShort: string;
  /** "Final report, LA County". */
  title: string;
}

export function reportContext(state: PortalState, report: Report): ReportContext {
  const grant = grantById(state, report.grantId);
  const funder = grant ? funderById(state, grant.funderId) : undefined;
  const funderShort = funderShortName(funder?.name);
  return { grant, funder, funderShort, title: `${kindWord(report)} report, ${funderShort}` };
}

export type ReportUrgency = 'overdue' | 'due-soon' | 'upcoming';

/** Where an open report stands, by the same rule as every other deadline. */
export function reportUrgency(report: Report, today: string): ReportUrgency {
  const days = daysUntil(report.dueDate, today);
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due-soon';
  return 'upcoming';
}

/** "17 days", "today", "3 days late"; or with `long`, "Due in 17 days", "3 days overdue". */
export function dueDaysText(dueDate: string, today: string, long = false): string {
  const days = daysUntil(dueDate, today);
  if (days === 0) return long ? 'Due today' : 'today';
  if (days > 0) {
    const n = `${days} ${days === 1 ? 'day' : 'days'}`;
    return long ? `Due in ${n}` : n;
  }
  const n = `${-days} ${days === -1 ? 'day' : 'days'}`;
  return long ? `${n} overdue` : `${n} late`;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/** "the 14 day reminder", "the due date reminder", "the repeat reminder 3 days after the due date". */
export function stepWords(step: ReminderStep): string {
  if (step.repeat) {
    const n = -step.offset;
    return `the repeat reminder ${n} ${n === 1 ? 'day' : 'days'} after the due date`;
  }
  return step.offset === 0 ? 'the due date reminder' : `the ${step.offset} day reminder`;
}

/** The plan a report falls back to: the office defaults, sent to the grant owner. */
export function defaultPlanFor(state: PortalState, report: Report): ReminderPlan {
  const d = state.grants.reminderDefaults;
  const owner = grantById(state, report.grantId)?.ownerId;
  return {
    reportId: report.id,
    offsets: [...d.offsets],
    recipientIds: [...new Set([owner, ...d.alsoNotifyIds].filter((id): id is string => !!id))],
    keepReminding: d.keepReminding,
  };
}

/** Two plans say the same thing, whatever order their lists are in. */
export function samePlan(
  a: Pick<ReminderPlan, 'offsets' | 'recipientIds' | 'keepReminding'>,
  b: Pick<ReminderPlan, 'offsets' | 'recipientIds' | 'keepReminding'>,
): boolean {
  const same = (x: Array<string | number>, y: Array<string | number>) =>
    x.length === y.length && [...x].sort().join('|') === [...y].sort().join('|');
  return (
    a.keepReminding === b.keepReminding &&
    same(a.offsets, b.offsets) &&
    same(a.recipientIds, b.recipientIds)
  );
}

/** "30, 14 and 3 days before the due date", for a sentence. */
export function offsetsSentence(offsets: number[]): string {
  const sorted = [...offsets].sort((a, b) => b - a);
  const parts = sorted.filter(o => o > 0).map(String);
  const onDay = sorted.includes(0);
  let text = '';
  if (parts.length === 1)
    text = `${parts[0]} ${parts[0] === '1' ? 'day' : 'days'} before the due date`;
  else if (parts.length > 1)
    text = `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]} days before the due date`;
  if (onDay) text = text ? `${text}, and on the day itself` : 'on the due date';
  return text || 'never';
}

/** "Barry Cogert and Denise Moreno", from full names. */
export function fullNames(state: PortalState, ids: string[]): string {
  const names = ids
    .map(id => state.core.staff.find(s => s.id === id)?.name)
    .filter((n): n is string => !!n);
  if (names.length === 0) return 'nobody';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

/** One chip: sent (teal, with a check), next (outlined in gold), or plain. */
export function ReminderChip({
  state = 'scheduled',
  children,
  small = false,
  title,
}: {
  state?: ReminderStep['state'] | 'plain';
  children: React.ReactNode;
  small?: boolean;
  title?: string;
}) {
  const cls = [
    'ja-rm-chip',
    state === 'sent' && 'is-sent',
    state === 'next' && 'is-next',
    small && 'is-small',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} title={title}>
      {state === 'sent' && <CheckMark size={10} />}
      {children}
    </span>
  );
}

/**
 * The chip that means "keeps reminding after the due date until submitted".
 * Outlined in gold when a repeat is the report's next email.
 */
export function RepeatChip({
  small = false,
  next = false,
  title = 'Keeps reminding after the due date until submitted',
}: {
  small?: boolean;
  next?: boolean;
  title?: string;
}) {
  return (
    <span
      className={'ja-rm-chip' + (next ? ' is-next' : '') + (small ? ' is-small' : '')}
      title={title}
      aria-label={next ? title : 'Keeps reminding after the due date'}
    >
      <Icon name="repeat" size={11} />
    </span>
  );
}

/** A drawn check, so it renders without waiting for the icon script. */
export function CheckMark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2 6.4 4.6 9 10 3.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The chips row for a schedule: one chip per day that is switched on. */
export function ReminderChips({
  steps,
  keepReminding,
  emptyText = 'No reminders',
  markNext = true,
}: {
  steps: ReminderStep[];
  keepReminding: boolean;
  emptyText?: string;
  /** Outline this schedule's next reminder in gold. Off when another report's email goes first. */
  markNext?: boolean;
}) {
  const on = steps
    .filter(s => s.enabled && !s.repeat)
    .map(s => (s.state === 'next' && !markNext ? { ...s, state: 'scheduled' as const } : s));
  if (on.length === 0 && !keepReminding) {
    return <span className="ja-rm-to">{emptyText}</span>;
  }
  // Repeats after the due date share the one repeat chip.
  const repeats = steps.filter(s => s.repeat);
  const repeatSent = repeats.filter(s => s.state === 'sent').length;
  const repeatNext = repeats.find(s => s.state === 'next');
  const repeatTitle = [
    repeatNext
      ? `Keeps reminding: sends next ${dateShort(repeatNext.date)}`
      : 'Keeps reminding after the due date until submitted',
    repeatSent > 0 && `${repeatSent} sent after the due date`,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <span className="ja-rm-chips">
      {on.map(s => (
        <ReminderChip
          key={s.offset}
          state={s.state}
          title={`${s.state === 'sent' ? 'Sent' : s.state === 'next' ? 'Sends next' : 'Sends'} ${dateShort(s.date)}`}
        >
          {offsetChip(s.offset)}
        </ReminderChip>
      ))}
      {keepReminding && <RepeatChip next={!!repeatNext && markNext} title={repeatTitle} />}
    </span>
  );
}

/**
 * A saved report's reminders: the chips, and under them who gets the email,
 * with the date of the first one when none has gone yet.
 */
export function ReportReminders({
  report,
  markNext = true,
}: {
  report: Report;
  markNext?: boolean;
}) {
  const { state, today } = useStore();
  const plan = reminderPlanFor(state, report.id);
  const steps = reminderSchedule(state, report.id, today);
  const anySent = steps.some(s => s.state === 'sent');
  const first = steps.find(s => s.enabled && s.state !== 'sent');
  const to = plan.recipientIds.length
    ? `To ${firstNames(state, plan.recipientIds)}`
    : 'Nobody is emailed';
  return (
    <span className="ja-rm-two" style={{ gap: 5 }}>
      <ReminderChips steps={steps} keepReminding={plan.keepReminding} markNext={markNext} />
      <span className="ja-rm-to is-wrap">
        {to}
        {!anySent && first && <> · first {dateShort(first.date)}</>}
      </span>
    </span>
  );
}

/** The legend under the chips. */
export function ReminderLegend({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="ja-rm-legend" style={style}>
      <span>
        <ReminderChip state="sent" small>
          30d
        </ReminderChip>
        Sent
      </span>
      <span>
        <ReminderChip state="next" small>
          14d
        </ReminderChip>
        Sends next
      </span>
      <span>
        <ReminderChip small>3d</ReminderChip>Days before the due date
      </span>
      <span>
        <RepeatChip small />
        Keeps reminding until submitted
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/**
 * A checkbox row: a real input (so it takes focus and the space bar), drawn
 * like the design-system Checkbox, with room after the label for a date or a role.
 */
export function CheckRow({
  checked,
  disabled = false,
  onChange,
  children,
  after,
  textOff = false,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
  after?: React.ReactNode;
  textOff?: boolean;
}) {
  return (
    <label className={'ja-rm-check' + (disabled ? ' is-disabled' : '')}>
      <input
        type="checkbox"
        className="ja-rm-check__input"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="ja-rm-check__box">{checked && <CheckMark />}</span>
      <span className={'ja-rm-check__text' + (textOff ? ' is-off' : '')}>{children}</span>
      {after}
    </label>
  );
}

/** The design-system Switch inside a real button, so it can be reached by keyboard. */
export function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="ja-rm-switch"
      onClick={() => onChange(!checked)}
    >
      <Switch checked={checked} />
    </button>
  );
}

export interface MenuItem {
  label: string;
  icon: string;
  onSelect: () => void;
}

/** "More" button with a short list of actions. Closes on a pick, a click elsewhere or Escape. */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <span
      className="ja-rm-menu"
      ref={ref}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="ja-rm-switch"
        style={{
          width: 28,
          height: 28,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-xs)',
          color: 'var(--text-muted)',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <Icon name="ellipsis" size={16} />
      </button>
      {open && (
        <span className="ja-rm-menu__list" role="menu" data-ja-menu="">
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="ja-rm-menu__item"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <Icon name={item.icon} size={14} />
              {item.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
