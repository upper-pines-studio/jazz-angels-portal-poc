import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Badge, Card, EmptyState, Icon } from '../../../../design-system';
import { dateShort, useCan, useStore } from '../../../../core';
import { hourLabel, nextReminder } from '../../domain';
import type { Report } from '../../domain';
import { OwnerAvatar } from '../../../../app/components/badges';
import { useToast } from '../../../../app/ToastHost';
import { LinkButton } from '../money/shared';
import {
  REPORT_STATUS_WORD,
  ReminderLegend,
  fullNames,
  ReportReminders,
  RowMenu,
  dueDaysText,
  kindWord,
  reportContext,
  reportUrgency,
  stepWords,
} from './ReminderParts';
import type { MenuItem } from './ReminderParts';

/**
 * "Reports owed": every report still due to a funder, when its reminder
 * emails go out and to whom. A row opens that report's reminders panel.
 */
export function ReportsOwedCard({
  reports,
  activeId,
  onOpen,
  onGone,
  empty,
}: {
  reports: Report[];
  activeId?: string;
  onOpen: (reportId: string) => void;
  /** A report left the list (submitted): close its panel if it is open. */
  onGone: (reportId: string) => void;
  /** What to show when nothing is owed. */
  empty: React.ReactNode;
}) {
  const { state, today, actions } = useStore();
  const allowed = useCan();
  // Reminder plans are deadlines (grants); the report itself is an award record.
  const mayEditReminders = allowed('grants', 'edit');
  const mayEditReport = allowed('award', 'edit');
  const nav = useNavigate();
  const toast = useToast();
  const hour = hourLabel(state.grants.reminderDefaults.sendHour);

  // The very next email across the reports shown, repeats after the due date included.
  const next = nextReminder(state, today, reports);

  const n = reports.length;
  const subtitle = `${n} ${n === 1 ? 'report' : 'reports'} to funders · reminder emails go out at ${hour}`;

  const menuFor = (r: Report): MenuItem[] => {
    const ctx = reportContext(state, r);
    const items: MenuItem[] = [];
    if (mayEditReminders)
      items.push({ label: 'Edit reminders', icon: 'bell', onSelect: () => onOpen(r.id) });
    if (mayEditReport && r.status === 'upcoming') {
      items.push({
        label: 'Start drafting',
        icon: 'pencil-line',
        onSelect: () => {
          actions.grants.updateReport(r.id, { status: 'drafting' });
          toast({
            tone: 'success',
            title: 'Drafting started',
            message: `${ctx.title} is now in drafting. Reminders say so.`,
          });
        },
      });
    }
    if (mayEditReport)
      items.push({
        label: 'Mark submitted',
        icon: 'send',
        onSelect: () => {
          actions.grants.markReportSubmitted(r.id, today);
          onGone(r.id);
          toast({
            tone: 'success',
            title: 'Report submitted',
            message: `${ctx.title} is off the list and its reminders have stopped.`,
          });
        },
      });
    items.push({
      label: 'Open grant',
      icon: 'arrow-up-right',
      onSelect: () => nav(`/grants/${r.grantId}?tab=reports`),
    });
    return items;
  };

  return (
    <Card
      title="Reports owed"
      subtitle={n ? subtitle : `Reminder emails go out at ${hour}`}
      padding="0"
      style={{ overflow: 'visible' }}
    >
      {n === 0 ? (
        empty
      ) : (
        <>
          {next &&
            (() => {
              const ctx = reportContext(state, next.report);
              return (
                <div className="ja-rm-banner">
                  <Icon name="mail" size={16} color="var(--gold-600)" style={{ marginTop: 2 }} />
                  <span>
                    Next reminder: <b>{format(parseISO(next.step.date), 'EEE, MMM d')}</b>,{' '}
                    {stepWords(next.step)} for the {ctx.funderShort}{' '}
                    {kindWord(next.report).toLowerCase()} report, to{' '}
                    {fullNames(state, next.recipientIds)}.
                  </span>
                </div>
              );
            })()}

          <div className="ja-rm-table" role="table" aria-label="Reports owed">
            <div className="ja-rm-thead" role="row">
              <span role="columnheader">Report</span>
              <span role="columnheader">Due</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Owner</span>
              <span role="columnheader">Reminders</span>
              <span role="columnheader" aria-label="Actions" />
            </div>
            {reports.map(r => {
              const ctx = reportContext(state, r);
              const urgency = reportUrgency(r, today);
              const active = r.id === activeId;
              return (
                <div
                  key={r.id}
                  role="row"
                  tabIndex={0}
                  aria-current={active || undefined}
                  className={'ja-rm-row' + (active ? ' is-active' : '')}
                  onClick={() => onOpen(r.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpen(r.id);
                    }
                  }}
                >
                  <span className="ja-rm-two" role="cell">
                    <span
                      className="is-wrap"
                      style={{
                        color: 'var(--text-strong)',
                        fontWeight: 'var(--weight-medium)' as React.CSSProperties['fontWeight'],
                      }}
                    >
                      {kindWord(r)} report{' '}
                      <span
                        style={{
                          fontWeight: 'var(--weight-regular)' as React.CSSProperties['fontWeight'],
                          color: 'var(--text-muted)',
                        }}
                      >
                        {ctx.funderShort}
                      </span>
                    </span>
                    <span className="ja-rm-sub">{ctx.grant?.title ?? 'Grant'}</span>
                  </span>
                  <span className="ja-rm-two" role="cell">
                    <span className="ja-rm-due">{dateShort(r.dueDate)}</span>
                    <span
                      className={
                        'ja-rm-days' +
                        (urgency === 'overdue'
                          ? ' is-late'
                          : urgency === 'due-soon'
                            ? ' is-soon'
                            : '')
                      }
                    >
                      {dueDaysText(r.dueDate, today)}
                    </span>
                  </span>
                  <span className="ja-rm-two" role="cell" style={{ alignItems: 'flex-start' }}>
                    <span>
                      {urgency === 'overdue' ? (
                        <Badge tone="danger" dot>
                          Overdue
                        </Badge>
                      ) : urgency === 'due-soon' ? (
                        <Badge tone="gold" dot>
                          Due soon
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Upcoming</Badge>
                      )}
                    </span>
                    <span className="ja-rm-sub">{REPORT_STATUS_WORD[r.status]}</span>
                  </span>
                  <span role="cell">
                    <OwnerAvatar staffId={ctx.grant?.ownerId} />
                  </span>
                  <span role="cell" style={{ minWidth: 0 }}>
                    <ReportReminders report={r} markNext={next?.report.id === r.id} />
                  </span>
                  <span
                    role="cell"
                    style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -2 }}
                  >
                    <RowMenu label={`Actions for ${ctx.title}`} items={menuFor(r)} />
                  </span>
                </div>
              );
            })}
          </div>
          <ReminderLegend />
        </>
      )}
    </Card>
  );
}

/** What the card says when nothing is owed. */
export function ReportsOwedEmpty({
  filtered,
  onClear,
  anyReports = true,
}: {
  filtered: boolean;
  onClear: () => void;
  /** False before any grant has a report, when "every report is in" would not be true. */
  anyReports?: boolean;
}) {
  if (!anyReports) {
    return (
      <EmptyState
        icon={<Icon name="file-check" size={22} />}
        title="No reports yet"
        message="The reports funders ask for show up here with their due dates and reminders. Add them on an awarded grant's Reports tab."
      />
    );
  }
  return filtered ? (
    <EmptyState
      icon={<Icon name="file-check" size={22} />}
      title="No reports owed for this owner"
      message="Reports on other people's grants are hidden by the owner filter."
      action={<LinkButton onClick={onClear}>Show every owner</LinkButton>}
    />
  ) : (
    <EmptyState
      icon={<Icon name="file-check" size={22} />}
      title="No reports owed"
      message="Every report is in. New ones appear here when they are added on a grant's Reports tab."
    />
  );
}
