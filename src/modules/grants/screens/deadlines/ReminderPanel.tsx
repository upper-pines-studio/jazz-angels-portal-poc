import React from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Button } from '../../../../design-system';
import { dateShort, daysUntil, useStore } from '../../../../core';
import {
  REMINDER_OFFSETS,
  firstNames,
  hourLabel,
  offsetLabel,
  reminderPlanFor,
} from '../../domain';
import type { ReminderPlan, Report } from '../../domain';
import { PanelSection, SidePanel } from '../../../../app/components/SidePanel';
import { OwnerAvatar } from '../../../../app/components/badges';
import { useToast } from '../../../../app/ToastHost';
import { LinkButton } from '../money/shared';
import {
  CheckRow,
  ToggleSwitch,
  dayBefore,
  defaultPlanFor,
  draftSchedule,
  kindWord,
  nextSend,
  reportContext,
  samePlan,
} from './ReminderParts';

type Draft = Pick<ReminderPlan, 'offsets' | 'recipientIds' | 'keepReminding'>;

const longDay = (iso: string) => format(parseISO(iso), 'EEEE, MMM d');

/**
 * One report's reminder emails: which days, to whom, whether to keep going
 * after the due date, and the email itself. Edits a draft; nothing changes
 * until "Save reminders". Give it `key={report.id}` so a new report starts fresh.
 */
export function ReminderPanel({ report, onClose }: { report: Report; onClose: () => void }) {
  const { state, today, user, actions } = useStore();
  const toast = useToast();
  const saved = reminderPlanFor(state, report.id);
  const defaults = state.grants.reminderDefaults;
  const ctx = reportContext(state, report);
  const grant = ctx.grant;

  const [draft, setDraft] = React.useState<Draft>(() => ({
    offsets: [...saved.offsets],
    recipientIds: [...saved.recipientIds],
    keepReminding: saved.keepReminding,
  }));
  const [confirmClose, setConfirmClose] = React.useState(false);

  const dirty = !samePlan(draft, saved);
  const noOne = draft.recipientIds.length === 0;
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose());

  const due = report.dueDate;
  const steps = draftSchedule(due, draft.offsets, today);
  const next = nextSend(due, draft, defaults.repeatEveryDays, today);
  const daysLeft = daysUntil(due, today);
  const status =
    report.status === 'drafting'
      ? 'in drafting'
      : report.status === 'upcoming'
        ? 'not started'
        : report.status;

  // --- the email --------------------------------------------------------------
  const kind = kindWord(report);
  const lateAtSend = next ? next.date > due : daysLeft < 0;
  const subject = `${kind} report for ${ctx.funderShort} ${lateAtSend ? 'was' : 'is'} due ${dateShort(due)}`;
  const funderName = ctx.funder?.name ?? 'the funder';
  let when = '';
  if (next) {
    const d = daysUntil(due, next.date);
    when =
      d > 0
        ? `is due to ${funderName} on ${longDay(due)}, in ${d} ${d === 1 ? 'day' : 'days'}`
        : d === 0
          ? `is due to ${funderName} today, ${longDay(due)}`
          : `was due to ${funderName} on ${longDay(due)}, ${-d} ${d === -1 ? 'day' : 'days'} ago`;
  }
  const progress =
    report.status === 'drafting' ? 'It is still in drafting.' : 'It has not been started yet.';
  const hi = noOne ? 'Hi' : `Hi ${firstNames(state, draft.recipientIds)}`;
  const grantLink = `/grants/${report.grantId}?tab=reports`;

  // --- changes ------------------------------------------------------------------
  const toggleOffset = (offset: number, on: boolean) =>
    setDraft(d => ({
      ...d,
      offsets: on
        ? [...d.offsets.filter(o => o !== offset), offset]
        : d.offsets.filter(o => o !== offset),
    }));
  const toggleWho = (id: string, on: boolean) =>
    setDraft(d => ({
      ...d,
      recipientIds: on
        ? [...d.recipientIds.filter(x => x !== id), id]
        : d.recipientIds.filter(x => x !== id),
    }));

  const save = () => {
    actions.grants.saveReminderPlan({
      reportId: report.id,
      offsets: [...draft.offsets].sort((a, b) => b - a),
      recipientIds: draft.recipientIds,
      keepReminding: draft.keepReminding,
    });
    setConfirmClose(false);
    toast({
      tone: 'success',
      title: 'Reminders saved',
      message: next
        ? `${ctx.title}: the next email goes to ${firstNames(state, draft.recipientIds)} on ${dateShort(next.date)}.`
        : `${ctx.title}: no more reminders will go out.`,
    });
  };

  const useDefaults = () => {
    actions.grants.resetReminderPlan(report.id);
    setDraft(defaultPlanFor(state, report));
    setConfirmClose(false);
    toast({
      tone: 'success',
      title: 'Back on the defaults',
      message: `${ctx.title} now follows the office reminder defaults.`,
    });
  };

  const sendTest = () => {
    toast({
      tone: 'info',
      title: 'Test not sent',
      message: `The demo does not send email. It would have sent "${subject}" to ${user.name} only.`,
    });
  };

  // Staff, the grant owner first.
  const staff = [...state.core.staff].sort(
    (a, b) => Number(b.id === grant?.ownerId) - Number(a.id === grant?.ownerId),
  );

  const footer = confirmClose ? (
    <>
      <span className="ja-rm-note" style={{ marginRight: 'auto', color: 'var(--text-strong)' }}>
        Discard your changes?
      </span>
      <Button variant="secondary" size="sm" onClick={() => setConfirmClose(false)}>
        Keep editing
      </Button>
      <Button variant="danger" size="sm" onClick={onClose}>
        Discard
      </Button>
    </>
  ) : (
    <>
      <span className="ja-rm-note" style={{ marginRight: 'auto', fontSize: 'var(--text-2xs)' }}>
        Only this report changes
      </span>
      <Button variant="secondary" size="sm" onClick={requestClose}>
        Cancel
      </Button>
      <Button variant="primary" size="sm" disabled={!dirty || noOne} onClick={save}>
        Save reminders
      </Button>
    </>
  );

  return (
    <SidePanel
      eyebrow="Reminders"
      title={ctx.title}
      subtitle={`Due ${format(parseISO(due), 'EEEE, MMM d, yyyy')} · ${daysLeft < 0 ? `${-daysLeft} ${daysLeft === -1 ? 'day' : 'days'} overdue, ` : ''}${status}`}
      onClose={requestClose}
      footer={footer}
    >
      <div
        className="ja-side-panel__section"
        style={{
          paddingTop: 'var(--space-3)',
          paddingBottom: 'var(--space-3)',
          background: 'var(--surface-sunken)',
        }}
      >
        {saved.isDefault ? (
          <span className="ja-rm-note">
            Following the office defaults{dirty ? '. Saving gives this report its own plan.' : '.'}
          </span>
        ) : (
          <span className="ja-rm-note">
            This report has its own plan.
            <LinkButton onClick={useDefaults}>Use the defaults</LinkButton>
          </span>
        )}
      </div>

      <PanelSection title="When to send">
        <div>
          {REMINDER_OFFSETS.map(o => {
            const date = dayBefore(due, o);
            const past = date <= today;
            const sent = past && saved.offsets.includes(o);
            const step = steps.find(s => s.offset === o);
            const checked = sent || (!past && draft.offsets.includes(o));
            const tag = sent ? (
              <span className="ja-rm-tag is-sent">Sent</span>
            ) : past ? (
              <span className="ja-rm-tag is-past">Already past</span>
            ) : step?.state === 'next' ? (
              <span className="ja-rm-tag is-next">Next</span>
            ) : null;
            return (
              <CheckRow
                key={o}
                checked={checked}
                disabled={past}
                textOff={!checked}
                onChange={on => toggleOffset(o, on)}
                after={
                  <>
                    <span className="ja-rm-check__date">{dateShort(date)}</span>
                    <span className="ja-rm-check__tag">{tag}</span>
                  </>
                }
              >
                {offsetLabel(o)}
              </CheckRow>
            );
          })}
        </div>
      </PanelSection>

      <PanelSection title="Who gets the email">
        <div>
          {staff.map(s => (
            <CheckRow
              key={s.id}
              checked={draft.recipientIds.includes(s.id)}
              onChange={on => toggleWho(s.id, on)}
              after={
                <span className="ja-rm-check__role">
                  {s.id === grant?.ownerId ? 'Grant owner' : s.title}
                </span>
              }
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <OwnerAvatar staffId={s.id} size={24} />
                {s.name}
              </span>
            </CheckRow>
          ))}
        </div>
        {noOne && (
          <p
            role="alert"
            style={{
              margin: 'var(--space-2) 0 0',
              font: 'var(--type-body-sm)',
              fontSize: 'var(--text-xs)',
              color: 'var(--danger-500)',
            }}
          >
            Pick at least one person to email.
          </p>
        )}
      </PanelSection>

      <PanelSection>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: 'var(--type-label)', color: 'var(--text-strong)' }}>
              Keep reminding after the due date
            </div>
            <div
              style={{
                marginTop: 2,
                font: 'var(--type-body-sm)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
              }}
            >
              Every {defaults.repeatEveryDays} {defaults.repeatEveryDays === 1 ? 'day' : 'days'}{' '}
              until someone marks it submitted.
              {draft.keepReminding && next && next.offset === undefined && (
                <> Next one goes out {dateShort(next.date)}.</>
              )}
            </div>
          </div>
          <ToggleSwitch
            checked={draft.keepReminding}
            label="Keep reminding after the due date"
            onChange={on => setDraft(d => ({ ...d, keepReminding: on }))}
          />
        </div>
      </PanelSection>

      <PanelSection
        title="Email preview"
        action={<LinkButton onClick={sendTest}>Send a test to me</LinkButton>}
      >
        {next ? (
          <div className="ja-rm-mail">
            <div className="ja-rm-mail__head">
              <span>
                From Jazz Angels Grants · {format(parseISO(next.date), 'EEE, MMM d')},{' '}
                {hourLabel(defaults.sendHour)}
              </span>
              <span>
                <b>{subject}</b>
              </span>
            </div>
            <div className="ja-rm-mail__body">
              <p>
                {hi}, the {kind.toLowerCase()} report for the {grant?.title ?? 'grant'} {when}.{' '}
                {progress}
              </p>
              <p>
                <Link to={grantLink}>Open the grant</Link> to finish the checklist and upload the
                report.
              </p>
            </div>
          </div>
        ) : (
          <div className="ja-rm-mail">
            <div className="ja-rm-mail__body">
              <p>
                No reminder is left to send for this report. Tick a day that is still ahead, or keep
                reminding after the due date.
              </p>
            </div>
          </div>
        )}
      </PanelSection>
    </SidePanel>
  );
}
