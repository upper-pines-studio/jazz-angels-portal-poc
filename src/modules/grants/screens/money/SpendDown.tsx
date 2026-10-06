import React from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, Tabs } from '../../../../design-system';
import { dateLong, money, useCan, useStore } from '../../../../core';
import type { PortalState } from '../../../../core';
import { usePageHeader } from '../../../../app/Shell';
import { useToast } from '../../../../app/ToastHost';
import {
  aboutMoney,
  funderById,
  linePaces,
  percent,
  PACE_LABEL,
  spendSeries,
  syncedLabel,
  wholePercent,
} from '../../domain';
import type { Grant, Pace, PaceStatus } from '../../domain';
import { PACE_COLOR, PaceBadge, PaceBar, PaceMark, downloadText, toCsv } from './shared';
import { SpendChart } from './SpendChart';
import { needsAttention, pacedGrants, periodText, resultText, whatToDo } from './spend';
import type { PacedGrant } from './spend';
import './spenddown.css';

type Show = 'all' | 'attention' | 'ended';

const TONE_CLASS: Record<PaceStatus, string> = {
  'spending-fast': 'sd-tone-fast',
  'spending-slow': 'sd-tone-slow',
  'on-track': 'sd-tone-track',
  ahead: 'sd-tone-track',
  'period-ended': 'sd-tone-slow',
  'not-started': 'sd-tone-muted',
};

/** The chart's conclusion in one sentence, for screen readers. */
function chartSummary(funder: string, pace: Pace, today: string): string {
  const head = `${funder} cumulative spending: ${money(pace.spent)}`;
  if (pace.status === 'not-started')
    return `${funder}: the grant period starts ${dateLong(pace.periodStart)}.`;
  if (pace.status === 'period-ended') {
    return `${head} of ${money(pace.budget)} spent by ${dateLong(pace.periodEnd)}, when the period ended; ${resultText(pace).toLowerCase()}.`;
  }
  const by = `${head} spent by ${dateLong(today)}`;
  if (pace.spent > pace.budget) return `${by}, ${money(pace.spent - pace.budget)} over the award.`;
  if (pace.runsOutOn)
    return `${by}; at this rate the ${money(pace.budget)} runs out around ${dateLong(pace.runsOutOn)}.`;
  if (pace.status === 'spending-slow') {
    return `${by}; at this rate about ${aboutMoney(pace.projectedSpent)} is spent by ${dateLong(pace.periodEnd)}, leaving about ${aboutMoney(pace.projectedUnspent)}.`;
  }
  return `${by}; at this rate about ${aboutMoney(pace.projectedSpent)} is spent by ${dateLong(pace.periodEnd)}, close to the ${money(pace.budget)} award.`;
}

function exportCsv(state: PortalState, today: string, rows: PacedGrant[]): string {
  const header = [
    'Grant',
    'Funder',
    'Period start',
    'Period end',
    'Award',
    'Spent',
    'Remaining',
    'Money used %',
    'Time gone %',
    'Days gone',
    'Days in period',
    'Spent per month so far',
    'Needed per month to finish',
    'Status',
    'At this rate',
    'Runs out on',
  ];
  return toCsv([
    header,
    ...rows.map(({ grant, pace }) => [
      grant.title,
      funderById(state, grant.funderId)?.name ?? '',
      pace.periodStart,
      pace.periodEnd,
      pace.budget,
      pace.spent,
      pace.remaining,
      wholePercent(pace.used),
      wholePercent(pace.elapsed),
      pace.daysElapsed,
      pace.daysTotal,
      Math.round(pace.perMonthSoFar),
      Math.round(pace.perMonthNeeded),
      PACE_LABEL[pace.status],
      resultText(pace),
      pace.runsOutOn ?? '',
    ]),
    [],
    [`Exported ${dateLong(today)}. Spending comes from QuickBooks; QuickBooks is read-only.`],
  ]);
}

/**
 * Spend-down: for each grant still running, whether its money will be used up
 * by the end date at today's rate, and what to do about it.
 */
export default function SpendDown() {
  const { state, today } = useStore();
  const mayConnect = useCan()('quickbooks-connect');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const nav = useNavigate();

  const all = pacedGrants(state, today);
  const running = all.filter(p => p.pace.status !== 'period-ended');
  const ended = all.filter(p => p.pace.status === 'period-ended');
  const attention = all.filter(p => needsAttention(p.pace.status));

  const raw = params.get('show');
  const show: Show = raw === 'attention' || raw === 'ended' ? raw : 'all';
  const visibleRunning =
    show === 'ended'
      ? []
      : show === 'attention'
        ? running.filter(p => needsAttention(p.pace.status))
        : running;
  const visibleEnded = show === 'attention' ? [] : ended;

  const setShow = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === 'all') p.delete('show');
    else p.set('show', next);
    setParams(p, { replace: true });
  };

  // /spend-down#<grantId> scrolls to that grant, widening the filter if it hides it.
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  React.useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      return;
    }
    if (show !== 'all' && all.some(p => p.grant.id === hash)) setShow('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, show]);

  const qb = state.grants.quickbooks;
  usePageHeader({
    title: 'Spend-down',
    subtitle:
      "Whether each grant's money will be fully spent by its end date if spending continues at today's rate.",
    actions: (
      <>
        <span className="sd-sync">
          {qb.connected ? (
            <>
              <Icon name="check" size={14} color="var(--teal-500)" />
              QuickBooks synced {syncedLabel(state, today)}
            </>
          ) : (
            <>
              <Icon name="unplug" size={14} />
              QuickBooks is not connected
            </>
          )}
        </span>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name="download" size={15} />}
          disabled={all.length === 0}
          onClick={() => {
            const file = `spend-down-${today}.csv`;
            downloadText(file, exportCsv(state, today, all));
            toast({
              tone: 'info',
              title: 'Spend-down exported',
              message: `${all.length} ${all.length === 1 ? 'grant' : 'grants'} in ${file}.`,
            });
          }}
        >
          Export
        </Button>
      </>
    ),
  });

  if (all.length === 0) {
    return (
      <Card padding="0">
        <EmptyState
          icon={<Icon name="gauge" size={22} />}
          title="No grants with money yet"
          message="A grant shows here once it is awarded, with an amount and a grant period. Spending from QuickBooks then draws its line against the end date."
          action={
            <Button variant="primary" size="sm" onClick={() => nav('/grants')}>
              Open grants
            </Button>
          }
        />
      </Card>
    );
  }

  const tabs = [
    { id: 'all', label: 'All', count: all.length },
    { id: 'attention', label: 'Needs attention', count: attention.length },
    { id: 'ended', label: 'Ended', count: ended.length },
  ];

  const nothing = visibleRunning.length === 0 && visibleEnded.length === 0;

  return (
    <div className="sd-page">
      <div className="ja-tabs-scroll">
        <Tabs tabs={tabs} active={show} onChange={setShow} style={{ borderBottom: 0 }} />
      </div>
      {!qb.connected && (
        <p className="sd-filter__note">
          QuickBooks is not connected, so these figures stop at the last sync.
          {mayConnect && (
            <>
              {' '}
              <Link to="/settings">Connect it in Settings</Link>.
            </>
          )}
        </p>
      )}
      {nothing && (
        <Card padding="0">
          {show === 'attention' ? (
            <EmptyState
              icon={<Icon name="circle-check" size={22} />}
              title="Nothing needs attention"
              message="Every running grant is spending close to an even pace. A grant that starts spending fast or slow shows up here."
            />
          ) : (
            <EmptyState
              icon={<Icon name="calendar-check" size={22} />}
              title="No grant periods have ended"
              message="When a grant's period ends, it moves here with what was left unspent and the report that is owed."
            />
          )}
        </Card>
      )}
      {visibleRunning.map(p => (
        <GrantCard key={p.grant.id} grant={p.grant} pace={p.pace} />
      ))}
      {visibleEnded.map(p => (
        <EndedCard key={p.grant.id} grant={p.grant} pace={p.pace} />
      ))}
    </div>
  );
}

/** One running grant: head, chart, figures, what to do and the lines behind it. */
function GrantCard({ grant, pace }: { grant: Grant; pace: Pace }) {
  const { state, today } = useStore();
  const mayAddLines = useCan()('award', 'edit');
  const nav = useNavigate();
  const [showLines, setShowLines] = React.useState(false);
  const funder = funderById(state, grant.funderId)?.name ?? 'Unknown funder';
  const series = spendSeries(state, grant.id, today);
  const lines = linePaces(state, grant.id, today);
  const linesId = `sd-lines-${grant.id}`;

  return (
    <section id={grant.id} className="sd-card">
      <Card padding="0">
        <div className="sd-head">
          <div style={{ minWidth: 0 }}>
            <Link to={`/grants/${grant.id}`} className="sd-head__title">
              {grant.title}
            </Link>
            <p className="sd-head__sub">
              {funder} · {periodText(pace.periodStart, pace.periodEnd)} · {money(pace.budget)}{' '}
              awarded{grant.restriction === 'restricted' ? ', restricted' : ''}
            </p>
          </div>
          <div className="sd-head__right">
            <PaceBadge status={pace.status} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => nav(`/grants/${grant.id}?tab=budget`)}
            >
              Open budget
            </Button>
          </div>
        </div>
        <div className="sd-body">
          <SpendChart pace={pace} series={series} summary={chartSummary(funder, pace, today)} />
          <div style={{ minWidth: 0 }}>
            <div className="sd-nums">
              <div>
                <span className="l">Money used</span>
                <span className="n">
                  {percent(pace.used)}
                  <small>
                    {money(pace.spent)} of {money(pace.budget)}
                  </small>
                </span>
              </div>
              <div>
                <span className="l">Time gone</span>
                <span className="n">
                  {percent(pace.elapsed)}
                  <small>
                    {pace.daysElapsed} of {pace.daysTotal} days
                  </small>
                </span>
              </div>
              <div>
                <span className="l">Spent per month so far</span>
                <span className="n">{aboutMoney(pace.perMonthSoFar)}</span>
              </div>
              <div>
                <span className="l">Needed per month to finish on time</span>
                <span className="n">{aboutMoney(pace.perMonthNeeded)}</span>
              </div>
            </div>
            <div className="sd-result">
              <span>At this rate</span>
              <span className={`v ${TONE_CLASS[pace.status]}`}>{pace.headline}</span>
            </div>
            <p className="sd-do">
              <strong>What to do:</strong> {whatToDo(state, grant, pace, today)}
            </p>
            <button
              type="button"
              className="sd-lines-toggle"
              aria-expanded={showLines}
              aria-controls={linesId}
              onClick={() => setShowLines(v => !v)}
            >
              <Icon name={showLines ? 'chevron-up' : 'chevron-down'} size={14} />
              {showLines
                ? 'Hide budget lines'
                : `Show budget lines${lines.length ? ` (${lines.length})` : ''}`}
            </button>
            {showLines && (
              <div id={linesId} className="sd-lines">
                {lines.length === 0 && (
                  <p className="sd-lines__empty">
                    No budget lines yet.
                    {mayAddLines && (
                      <>
                        {' '}
                        <Link to={`/grants/${grant.id}?tab=budget`}>
                          Add them on the Budget tab
                        </Link>{' '}
                        to see which line is driving the pace.
                      </>
                    )}
                  </p>
                )}
                {lines.map(l => (
                  <Link
                    key={l.line.id}
                    className="sd-line"
                    to={`/transactions?tab=assigned&grant=${grant.id}&line=${l.line.id}`}
                    title={`${money(l.spent)} of ${money(l.budget)}. View the transactions on this line.`}
                  >
                    <span className="sd-line__name">{l.line.category}</span>
                    <PaceBar used={l.used} elapsed={l.elapsed} color={PACE_COLOR[l.status]} />
                    <span className="sd-line__pct">{percent(l.used)}</span>
                    <PaceMark status={l.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}

/** A grant whose period is over: one row with the final figure and the report to send. */
function EndedCard({ grant, pace }: { grant: Grant; pace: Pace }) {
  const { state, today } = useStore();
  const funder = funderById(state, grant.funderId)?.name ?? 'Unknown funder';
  const series = spendSeries(state, grant.id, today);
  const resultClass =
    pace.remaining > 0 ? 'sd-tone-slow' : pace.remaining < 0 ? 'sd-tone-fast' : '';

  return (
    <section id={grant.id} className="sd-card">
      <Card padding="0">
        <div className="sd-compact">
          <div style={{ minWidth: 0 }}>
            <Link to={`/grants/${grant.id}`} className="sd-compact__title">
              {grant.title}
            </Link>
            <p className="sd-compact__who">{funder}</p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: 8,
                flexWrap: 'wrap',
              }}
            >
              <PaceBadge status="period-ended" />
              <span className="sd-compact__when">
                {periodText(pace.periodStart, pace.periodEnd)}
              </span>
            </div>
          </div>
          <SpendChart
            compact
            pace={pace}
            series={series}
            summary={chartSummary(funder, pace, today)}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div className="sd-strip">
              <div>
                <span className="l">Used</span>
                <span className="n">{percent(pace.used)}</span>
              </div>
              <div>
                <span className="l">Time gone</span>
                <span className="n">100%</span>
              </div>
              <div>
                <span className="l">Spent per month</span>
                <span className="n">{aboutMoney(pace.perMonthSoFar)}</span>
              </div>
              <div>
                <span className="l">Needed per month</span>
                <span className="n word">None, period over</span>
              </div>
              <div>
                <span className="l">Result</span>
                <span className={`n word ${resultClass}`}>{resultText(pace)}</span>
              </div>
            </div>
            <p className="sd-do" style={{ paddingTop: 0 }}>
              {whatToDo(state, grant, pace, today)}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <Link
                className="sd-lines-toggle"
                style={{ marginTop: 0 }}
                to={`/grants/${grant.id}?tab=reports`}
              >
                Open reports
              </Link>
              <Link
                className="sd-lines-toggle"
                style={{ marginTop: 0 }}
                to={`/budget?grant=${grant.id}`}
              >
                Budget vs. actual
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
