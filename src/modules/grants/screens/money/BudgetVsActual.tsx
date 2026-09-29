import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, Select, StatCard } from '../../../../design-system';
import { dateLong, dateShort, fiscalYear, money, useStore } from '../../../../core';
import { usePageHeader } from '../../../../app/Shell';
import { useToast } from '../../../../app/ToastHost';
import { TableScroll } from '../../../../app/components/TableScroll';
import { aboutMoney, percent, syncedLabel } from '../../domain';
import type { LinePace } from '../../domain';
import { LinkButton, PaceBadge, PaceBar, PaceMark, PACE_COLOR, downloadText, toCsv } from './shared';
import {
  bvaCsvRows, bvaGrants, bvaTotals, hasPreviousFy, howLongBefore, isIdle, periodNote, previousFy, reportName,
} from './bva';
import type { BvaGrant, BvaPeriod } from './bva';
import './bva.css';

const PERIODS: BvaPeriod[] = ['fy', 'all', 'fy-prev'];

function asPeriod(v: string | null): BvaPeriod {
  return PERIODS.includes(v as BvaPeriod) ? (v as BvaPeriod) : 'fy';
}

/** Budget vs. actual: every grant with money and each budget line, spent against an even pace. */
export default function BudgetVsActual() {
  const { state, today } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const period = asPeriod(params.get('period'));
  const target = params.get('grant');

  const fyStart = state.core.settings.fiscalYearStartMonth;
  const fy = fiscalYear(today, fyStart);
  const prev = previousFy(today, fyStart);
  const showPrev = hasPreviousFy(state, today) || period === 'fy-prev';

  const rows = bvaGrants(state, today, period);
  const totals = bvaTotals(rows);
  const periodLabel = period === 'fy' ? fy.label : period === 'fy-prev' ? prev.label : 'all';

  // Which grants are open. Unset means the default: open unless its period has ended.
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const isOpen = (r: BvaGrant) => open[r.grant.id] ?? (r.grant.id === target || r.pace.status !== 'period-ended');

  // ?grant= opens that grant and brings it into view.
  const rowRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  React.useEffect(() => {
    if (!target) return;
    setOpen(o => ({ ...o, [target]: true }));
    const frame = window.requestAnimationFrame(() => rowRefs.current[target]?.scrollIntoView({ block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [target, period]);

  const setPeriod = (next: BvaPeriod) => {
    const p = new URLSearchParams(params);
    if (next === 'fy') p.delete('period');
    else p.set('period', next);
    setParams(p, { replace: true });
  };

  const exportCsv = () => {
    const name = `budget-vs-actual-${periodLabel}.csv`;
    downloadText(name, toCsv(bvaCsvRows(rows)));
    toast({
      tone: 'success',
      title: `Saved ${name}`,
      message: `${rows.length} ${rows.length === 1 ? 'grant' : 'grants'} and ${totals.lineCount} budget lines, ready to open in Excel.`,
    });
  };

  const setAll = (value: boolean) => {
    setOpen(Object.fromEntries(rows.map(r => [r.grant.id, value])));
  };

  const qb = state.grants.quickbooks;
  usePageHeader({
    title: 'Budget vs. actual',
    subtitle: `Every grant and budget line, budgeted against spent · ${qb.connected ? `QuickBooks synced ${syncedLabel(state, today)}` : 'QuickBooks is not connected'}`,
    actions: (
      <div className="bva-actions">
        <label className="bva-period">
          <span className="bva-sr">Period</span>
          <Icon name="calendar" size={14} />
          <Select
            value={period}
            onChange={e => setPeriod(asPeriod(e.target.value))}
            options={[
              { value: 'fy', label: `This fiscal year · ${fy.label}` },
              ...(showPrev ? [{ value: 'fy-prev', label: `Last fiscal year · ${prev.label}` }] : []),
              { value: 'all', label: 'All grants with money' },
            ]}
          />
        </label>
        {rows.length > 0 && (
          <div className="bva-export">
            <span className="bva-export__label">Export</span>
            <div className="bva-seg">
              <Button variant="secondary" size="sm" iconLeft={<Icon name="download" size={14} />} onClick={exportCsv}>Excel</Button>
              <Button variant="secondary" size="sm" onClick={() => window.print()}>PDF</Button>
            </div>
          </div>
        )}
      </div>
    ),
  });

  if (rows.length === 0) {
    const where = period === 'all' ? 'yet' : `in ${periodLabel}`;
    return (
      <Card padding="var(--space-6)">
        <EmptyState
          icon={<Icon name="chart-bar-big" size={22} />}
          title={`No grants with money ${where}`}
          message="A grant shows up here once it is awarded and the award amount is recorded. Record the award on the grant, add its budget lines, and spending from QuickBooks is measured against them."
          action={period === 'all'
            ? <Button variant="primary" size="sm" onClick={() => nav('/grants')}>Go to grants</Button>
            : <Button variant="secondary" size="sm" onClick={() => setPeriod('all')}>Show all grants with money</Button>}
        />
      </Card>
    );
  }

  const used = totals.awarded > 0 ? totals.spent / totals.awarded : 0;
  const att = totals.attention;
  const attentionParts = [
    att.over ? `${att.over} over budget` : '',
    att.fast ? `${att.fast} spending fast` : '',
    att.idle ? `${att.idle} with no spending yet` : '',
  ].filter(Boolean);

  const ended = totals.leftOnEnded;
  const remainingNote = ended.length === 0
    ? 'Nothing left on grants that have ended'
    : `Includes ${ended.map(e => `${money(e.amount)} left on ${e.name}`).join(' and ')}, ended`;

  return (
    <div className="bva-page">
      <div className="ja-grid-stats">
        <StatCard
          label="Awarded" accent="var(--blue-900)" value={money(totals.awarded)}
          footnote={rows.length === 1 ? '1 grant, shown below' : `${rows.length} grants, each shown below`}
        />
        <StatCard
          label="Spent" accent="var(--blue-500)" value={money(totals.spent)}
          unit={<><span className="bva-mono">{percent(used)}</span> used</>}
          footnote={qb.connected ? 'Assigned from QuickBooks, read-only' : 'Assigned expenses. QuickBooks is not connected'}
        />
        <StatCard label="Remaining" accent="var(--teal-500)" value={money(totals.remaining)} footnote={remainingNote} />
        <StatCard
          label="Lines needing attention" accent="var(--gold-400)" value={att.total}
          unit={<>of <span className="bva-mono">{totals.lineCount}</span> lines</>}
          footnote={attentionParts.length ? attentionParts.join(' · ') : 'Every running line is on a sensible pace'}
        />
      </div>

      <Card padding="0">
        <div className="bva-head">
          <div>
            <h3 className="bva-head__title">Budget lines by grant</h3>
            <p className="bva-head__sub">Spending against an even pace through each grant period</p>
          </div>
          <div className="bva-legend">
            <span className="bva-legend__k"><span className="bva-legend__sw" />Spent</span>
            <span className="bva-legend__k"><span className="bva-legend__tk" />Expected by now, share of the period gone</span>
            <span className="bva-legend__k"><span className="bva-legend__sw is-gold" />On course to run out early</span>
            {totals.overLines === 0
              ? <span className="bva-legend__ok"><Icon name="check" size={13} />No lines over budget</span>
              : <span className="bva-legend__over"><Icon name="circle-alert" size={13} />{totals.overLines} {totals.overLines === 1 ? 'line' : 'lines'} over budget</span>}
          </div>
        </div>

        <TableScroll minWidth={1100}>
          <div className="bva-table">
            <div className="bva-row bva-thead">
              <span className="bva-thead__first">
                Grant and line
                <span className="bva-noprint bva-thead__tools">
                  <LinkButton onClick={() => setAll(true)}>Expand all</LinkButton>
                  <span aria-hidden="true">·</span>
                  <LinkButton onClick={() => setAll(false)}>Collapse all</LinkButton>
                </span>
              </span>
              <span className="bva-num">Budgeted</span>
              <span className="bva-num">Spent</span>
              <span className="bva-num">Remaining</span>
              <span>Used</span>
              <span className="bva-num">%</span>
              <span>Pace</span>
            </div>

            {rows.map(r => (
              <GrantBlock
                key={r.grant.id}
                row={r}
                open={isOpen(r)}
                target={r.grant.id === target}
                onToggle={() => setOpen(o => ({ ...o, [r.grant.id]: !isOpen(r) }))}
                rowRef={el => { rowRefs.current[r.grant.id] = el; }}
              />
            ))}

            <div className="bva-row bva-total">
              <span className="bva-total__label">Total, {rows.length} {rows.length === 1 ? 'grant' : 'grants'}</span>
              <span className="bva-num bva-mono">{money(totals.awarded)}</span>
              <span className="bva-num bva-mono">{money(totals.spent)}</span>
              <span className={'bva-num bva-mono' + (totals.remaining < 0 ? ' is-over' : '')}>{money(totals.remaining)}</span>
              <span><PaceBar used={used} elapsed={0} showTick={false} /></span>
              <span className="bva-pct">{percent(used)}</span>
              <span className="bva-muted">
                {att.total === 0 ? 'Nothing needs a look' : `${att.total} ${att.total === 1 ? 'line needs' : 'lines need'} a look`}
              </span>
            </div>
          </div>
        </TableScroll>
      </Card>
    </div>
  );
}

/** A grant's row and, when open, a row per budget line. */
function GrantBlock({ row, open, target, onToggle, rowRef }: {
  row: BvaGrant;
  open: boolean;
  target: boolean;
  onToggle: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
}) {
  const { grant, pace } = row;
  const linesId = `bva-lines-${grant.id}`;
  const fromControl = (e: React.MouseEvent) => !!(e.target as HTMLElement).closest('a, button, select, input');

  return (
    <div className="bva-block">
      <div
        ref={rowRef}
        className={'bva-row bva-grant' + (target ? ' is-target' : '')}
        onClick={e => { if (!fromControl(e)) onToggle(); }}
      >
        <div className="bva-gname">
          <button
            type="button"
            className={'bva-chev bva-noprint' + (open ? ' is-open' : '')}
            aria-expanded={open}
            aria-controls={linesId}
            aria-label={`${open ? 'Hide' : 'Show'} budget lines for ${grant.title}`}
            onClick={onToggle}
          >
            <Icon name="chevron-right" size={16} />
          </button>
          <div className="bva-gname__text">
            <Link className="bva-gname__title" to={`/grants/${grant.id}?tab=budget`}>{grant.title}</Link>
            <span className="bva-gname__funder">
              {row.funder} · {grant.restriction === 'restricted' ? 'Restricted' : 'Unrestricted'}
            </span>
            <span className="bva-gname__period">{periodNote(row)}</span>
          </div>
        </div>
        <span className="bva-num bva-mono is-strong">{money(pace.budget)}</span>
        <span className="bva-num bva-mono is-strong">{money(pace.spent)}</span>
        <span className={'bva-num bva-mono is-strong' + (pace.remaining < 0 ? ' is-over' : '')}>{money(pace.remaining)}</span>
        <span><PaceBar used={pace.used} elapsed={pace.elapsed} showTick={pace.status !== 'not-started'} /></span>
        <span className="bva-pct">{percent(pace.used)}</span>
        <div className="bva-gpace">
          <PaceBadge status={pace.status} dot={false} />
          <GrantHeadline row={row} />
        </div>
      </div>

      <div id={linesId} className={'bva-lines' + (open ? '' : ' is-collapsed')}>
        {row.lines.length === 0 ? (
          <div className="bva-row bva-line bva-nolines">
            <span className="bva-nolines__text">
              {row.closed
                ? 'No budget lines were kept for this grant, so only its totals show.'
                : 'No budget lines yet. Add them to see which parts of the award are spending fast or slow.'}
            </span>
            <Link className="bva-link" to={`/grants/${grant.id}?tab=budget`}>Add budget lines</Link>
          </div>
        ) : (
          row.lines.map(l => <LineRow key={l.line.id} row={row} line={l} />)
        )}
      </div>
    </div>
  );
}

/** What a grant is headed for, under its badge. */
function GrantHeadline({ row }: { row: BvaGrant }) {
  const { pace, report, closed } = row;
  const b = (text: string) => <b>{text}</b>;
  let first: React.ReactNode;
  if (pace.spent > pace.budget) first = <>{b(money(pace.spent - pace.budget))} over budget</>;
  else if (pace.status === 'period-ended') {
    first = pace.remaining > 0 ? <>{b(money(pace.remaining))} left unspent</> : 'Fully spent';
  } else if (pace.status === 'spending-fast' && pace.runsOutOn) first = <>Runs out around {b(dateLong(pace.runsOutOn))}</>;
  else if (pace.status === 'spending-slow') {
    first = pace.spent === 0 ? 'No spending yet' : <>About {b(aboutMoney(pace.projectedUnspent))} left unspent</>;
  } else if (pace.status === 'not-started') first = pace.headline;
  else first = 'On course to finish on time';

  return (
    <>
      <span className="bva-gpace__c">{first}</span>
      {pace.status === 'period-ended' && report && (
        <Link className="bva-gpace__c bva-gpace__report" to={`/deadlines?kind=report&report=${report.id}`}>
          {reportName(report)} due {b(dateShort(report.dueDate))}
        </Link>
      )}
      {closed && <span className="bva-gpace__c">Grant closed</span>}
    </>
  );
}

/** One budget line, with a warning band when it needs a look. */
function LineRow({ row, line }: { row: BvaGrant; line: LinePace }) {
  const nav = useNavigate();
  const { grant } = row;
  const to = `/grants/${grant.id}?tab=budget&line=${line.line.id}`;
  const txTo = `/transactions?tab=assigned&grant=${grant.id}&line=${line.line.id}`;
  const over = line.spent > line.budget;
  const fast = !over && line.status === 'spending-fast';
  const idle = isIdle(line);
  const band = over ? ' is-over' : fast ? ' is-fast' : '';

  let why: React.ReactNode = null;
  if (over) {
    const running = line.status !== 'period-ended' && line.status !== 'not-started';
    why = (
      <>
        <b>{money(line.spent - line.budget)} over budget.</b>{' '}
        {percent(line.used)} used{running ? ` with ${percent(line.elapsed)} of the period gone` : ''}. Move some spending
        to another line or ask the funder about a budget change.
      </>
    );
  } else if (fast && line.runsOutOn && line.periodEnd) {
    why = (
      <>
        <b>{percent(line.used)} used with {percent(line.elapsed)} of the period gone.</b> At this rate the line runs out
        around {dateLong(line.runsOutOn)}, {howLongBefore(line.runsOutOn, line.periodEnd)} before the grant ends.
      </>
    );
  }

  return (
    <div
      className={'bva-row bva-line' + band}
      onClick={e => { if (!(e.target as HTMLElement).closest('a, button')) nav(to); }}
    >
      <span className="bva-cat">
        <Link to={to} className="bva-cat__name">{line.line.category}</Link>
        {idle && <span className="bva-cat__idle">No spending yet with {percent(line.elapsed)} of the period gone</span>}
      </span>
      <span className="bva-num bva-mono">{money(line.budget)}</span>
      <span className="bva-num bva-mono">{money(line.spent)}</span>
      <span className={'bva-num bva-mono' + (over ? ' is-over' : '')}>{money(line.remaining)}</span>
      <span>
        <PaceBar
          used={line.used}
          elapsed={line.elapsed}
          color={fast ? PACE_COLOR['spending-fast'] : 'var(--blue-500)'}
          showTick={line.status !== 'not-started'}
        />
      </span>
      <span className="bva-pct">{percent(line.used)}</span>
      <span><PaceMark status={line.status} /></span>
      {why && (
        <div className="bva-why">
          <Icon name={over ? 'circle-alert' : 'triangle-alert'} size={14} />
          <span className="bva-why__text">{why}</span>
          <Link className="bva-link bva-noprint" to={txTo}>View transactions</Link>
        </div>
      )}
    </div>
  );
}
