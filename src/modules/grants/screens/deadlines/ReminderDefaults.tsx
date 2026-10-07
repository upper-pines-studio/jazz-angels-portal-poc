import React from 'react';
import { Button, Card, Dialog, Field, Input, Select } from '../../../../design-system';
import { isArchived, useCan, useStore } from '../../../../core';
import { REMINDER_OFFSETS, hourLabel, offsetChip, offsetLabel } from '../../domain';
import { useToast } from '../../../../app/ToastHost';
import { OwnerAvatar } from '../../../../app/components/badges';
import {
  CheckRow,
  ReminderChip,
  RepeatChip,
  ToggleSwitch,
  fullNames,
  offsetsSentence,
} from './ReminderParts';

/** The office's reminder defaults: the summary card on Deadlines, and the dialog that edits them. */

/** Hours an email can go out, 6:00 am to 6:00 pm. */
const HOURS = Array.from({ length: 13 }, (_, i) => i + 6);

/** "to the grant owner and Denise Moreno". */
export function defaultsRecipientsText(names: string, count: number): string {
  return count ? `to the grant owner and ${names}` : 'to the grant owner';
}

/** Edit the defaults every report follows unless it has its own plan. */
export function ReminderDefaultsDialog({ onClose }: { onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const d = state.grants.reminderDefaults;
  const [offsets, setOffsets] = React.useState<number[]>(d.offsets);
  const [also, setAlso] = React.useState<string[]>(d.alsoNotifyIds);
  const [keep, setKeep] = React.useState(d.keepReminding);
  const [every, setEvery] = React.useState(String(d.repeatEveryDays));
  const [hour, setHour] = React.useState(String(d.sendHour));

  const everyN = Number(every);
  const everyOk = !keep || (Number.isInteger(everyN) && everyN >= 1 && everyN <= 30);
  const own = state.grants.reminderPlans.length;

  const toggle = <T,>(list: T[], item: T, on: boolean) =>
    on ? [...list.filter(x => x !== item), item] : list.filter(x => x !== item);

  const save = () => {
    const sorted = [...offsets].sort((a, b) => b - a);
    actions.grants.updateReminderDefaults({
      offsets: sorted,
      alsoNotifyIds: also,
      keepReminding: keep,
      repeatEveryDays: keep ? everyN : d.repeatEveryDays,
      sendHour: Number(hour),
    });
    toast({
      tone: 'success',
      title: 'Reminder defaults saved',
      message: sorted.length
        ? `Emails go out ${offsetsSentence(sorted)}, at ${hourLabel(Number(hour))}.`
        : 'Reports that follow the defaults send no reminders now.',
    });
    onClose();
  };

  return (
    <Dialog
      open
      title="Default reminders"
      width={520}
      onClose={onClose}
      description={`Every report follows these unless it has its own plan${own ? ` (${own} ${own === 1 ? 'report does' : 'reports do'})` : ''}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!everyOk} onClick={save}>
            Save defaults
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Field
          label="When to send"
          hint={
            offsets.length
              ? undefined
              : 'With no days ticked, only reports with their own plan get reminders.'
          }
        >
          <div>
            {REMINDER_OFFSETS.map(o => (
              <CheckRow
                key={o}
                checked={offsets.includes(o)}
                onChange={on => setOffsets(list => toggle(list, o, on))}
                after={<span className="ja-rm-check__date">{offsetChip(o)}</span>}
              >
                {offsetLabel(o)}
              </CheckRow>
            ))}
          </div>
        </Field>

        <Field label="Who else gets the email" hint="The grant owner always gets it.">
          <div>
            {state.core.staff
              .filter(s => !isArchived(s) || also.includes(s.id))
              .map(s => (
                <CheckRow
                  key={s.id}
                  checked={also.includes(s.id)}
                  onChange={on => setAlso(list => toggle(list, s.id, on))}
                  after={<span className="ja-rm-check__role">{s.title}</span>}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <OwnerAvatar staffId={s.id} size={24} />
                    {s.name}
                  </span>
                </CheckRow>
              ))}
          </div>
        </Field>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: 'var(--type-label)', color: 'var(--text-strong)' }}>
              Keep reminding after the due date
            </div>
            <div
              style={{
                font: 'var(--type-body-sm)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
              }}
            >
              Until someone marks the report submitted.
            </div>
          </div>
          <ToggleSwitch
            checked={keep}
            onChange={setKeep}
            label="Keep reminding after the due date"
          />
        </div>

        <div className="ja-grid-2">
          <Field label="Repeat every" error={everyOk ? undefined : 'Between 1 and 30 days.'}>
            <Input
              type="number"
              value={every}
              disabled={!keep}
              suffix="days"
              invalid={!everyOk}
              onChange={e => setEvery(e.target.value)}
            />
          </Field>
          <Field label="Emails go out at">
            <Select
              value={hour}
              onChange={e => setHour(e.target.value)}
              options={HOURS.map(h => ({ value: String(h), label: hourLabel(h) }))}
            />
          </Field>
        </div>
        {also.length > 0 && (
          <p className="ja-rm-note" style={{ margin: 0 }}>
            A report that follows the defaults emails its grant owner and {fullNames(state, also)}.
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** The defaults as chips: "30d 14d 3d", and the repeat mark when they keep reminding. */
export function DefaultChips() {
  const { state } = useStore();
  const d = state.grants.reminderDefaults;
  const sorted = [...d.offsets].sort((a, b) => b - a);
  if (!sorted.length && !d.keepReminding)
    return <span className="ja-rm-to">No reminders by default</span>;
  return (
    <span className="ja-rm-chips">
      {sorted.map(o => (
        <ReminderChip key={o}>{offsetChip(o)}</ReminderChip>
      ))}
      {d.keepReminding && <RepeatChip />}
    </span>
  );
}

/** The "Default reminders" card under the reports on Deadlines. */
export function ReminderDefaultsCard() {
  const { state } = useStore();
  const mayEdit = useCan()('grants', 'edit');
  const [editing, setEditing] = React.useState(false);
  const d = state.grants.reminderDefaults;
  return (
    <>
      <Card padding="0">
        <div className="ja-rm-default">
          <div className="ja-rm-default__main">
            <span
              style={{
                font: 'var(--weight-semibold) var(--text-base)/1.3 var(--font-sans)',
                color: 'var(--text-strong)',
              }}
            >
              Default reminders
            </span>
            <span
              style={{
                font: 'var(--type-body-sm)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
              }}
            >
              {mayEdit
                ? 'Every new report starts with these. Change them for one report here, or for everyone in Settings.'
                : 'Every new report starts with these.'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <DefaultChips />
              <span className="ja-rm-to" style={{ whiteSpace: 'normal' }}>
                {defaultsRecipientsText(fullNames(state, d.alsoNotifyIds), d.alsoNotifyIds.length)}
              </span>
            </span>
          </div>
          {mayEdit && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit defaults
            </Button>
          )}
        </div>
      </Card>
      {editing && mayEdit && <ReminderDefaultsDialog onClose={() => setEditing(false)} />}
    </>
  );
}
