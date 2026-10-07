import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '../../../../design-system';
import { activeOnly, dateShort, useCan, useStore } from '../../../../core';
import {
  firstNames,
  hourLabel,
  isReportOpen,
  reminderPlanFor,
  reminderSchedule,
} from '../../domain';
import { Eyebrow } from '../../../../app/components/badges';
import { DefaultChips, ReminderDefaultsDialog } from '../deadlines/ReminderDefaults';
import {
  ReminderChips,
  fullNames,
  offsetsSentence,
  reportContext,
} from '../deadlines/ReminderParts';
import './settings-cards.css';

/** Settings: when report reminders go out by default, and to whom. */
export function RemindersCard() {
  const { state, today } = useStore();
  // Reminders are deadlines: "Grants: pipeline, checklist, deadlines" (decision 0001).
  const mayEdit = useCan()('grants', 'edit');
  const [editing, setEditing] = React.useState(false);
  const d = state.grants.reminderDefaults;

  const who = d.alsoNotifyIds.length
    ? `the grant owner and ${fullNames(state, d.alsoNotifyIds)}`
    : 'the grant owner';
  const after = d.keepReminding
    ? ` After the due date they keep coming every ${d.repeatEveryDays} ${d.repeatEveryDays === 1 ? 'day' : 'days'} until the report is marked submitted.`
    : ' They stop once the due date has passed.';

  // Open reports that do not follow the defaults.
  const own = state.grants.reminderPlans
    .map(p => state.grants.reports.find(r => r.id === p.reportId))
    .filter(
      (r): r is NonNullable<typeof r> =>
        !!r && isReportOpen(r) && activeOnly(state.grants.grants).some(g => g.id === r.grantId),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <>
      <Card
        title="Report reminders"
        subtitle="When reminder emails go out for a report, unless that report says otherwise."
        action={
          mayEdit ? (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit defaults
            </Button>
          ) : undefined
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <DefaultChips />
            <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--text-body)' }}>
              {d.offsets.length ? (
                <>
                  Emails go out at <strong>{hourLabel(d.sendHour)}</strong>,{' '}
                  {offsetsSentence(d.offsets)}, to {who}.
                </>
              ) : (
                <>
                  No reminders go out by default. Emails would go to {who} at{' '}
                  {hourLabel(d.sendHour)}.
                </>
              )}
              {after}
            </p>
          </div>

          <div>
            <Eyebrow>Reports with their own plan</Eyebrow>
            {own.length === 0 ? (
              <p
                style={{
                  margin: 'var(--space-2) 0 0',
                  font: 'var(--type-body-sm)',
                  color: 'var(--text-muted)',
                }}
              >
                Every open report follows these defaults. To change one, open its reminders from
                Deadlines.
              </p>
            ) : (
              <div style={{ marginTop: 'var(--space-1)' }}>
                {own.map(r => {
                  const plan = reminderPlanFor(state, r.id);
                  return (
                    <div key={r.id} className="ja-rm-own">
                      <Link
                        to={`/deadlines?kind=report&report=${r.id}`}
                        style={{
                          fontWeight: 'var(--weight-medium)' as React.CSSProperties['fontWeight'],
                        }}
                      >
                        {reportContext(state, r).title}
                      </Link>
                      <span
                        style={{
                          font: 'var(--type-numeric)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        due {dateShort(r.dueDate)}
                      </span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 'var(--space-3)',
                          flexWrap: 'wrap',
                        }}
                      >
                        <ReminderChips
                          steps={reminderSchedule(state, r.id, today)}
                          keepReminding={plan.keepReminding}
                        />
                        <span className="ja-rm-to">to {firstNames(state, plan.recipientIds)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>
      {editing && <ReminderDefaultsDialog onClose={() => setEditing(false)} />}
    </>
  );
}
