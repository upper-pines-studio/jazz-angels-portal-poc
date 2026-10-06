import React from 'react';
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  addMonths,
} from 'date-fns';
import { dateLong, money } from '../../../../core';
import { aboutMoney } from '../../domain';
import type { Pace } from '../../domain';
import { niceStep, shortMoney } from './spend';

/**
 * The spend-down chart, drawn as inline SVG: cumulative spending against the
 * grant period, with the award, an even pace, today and where today's rate
 * leads. The viewBox follows the measured width, so one unit is one pixel and
 * the text stays the same size on a phone as on a desktop.
 */

type Anchor = 'start' | 'middle' | 'end';
type Tone = 'fast' | 'slow' | 'track';
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
interface Label {
  text: string;
  cls: string;
  x: number;
  y: number;
  anchor: Anchor;
}
interface Want {
  text: string;
  cls: string;
  cands: Array<[number, number, Anchor]>;
  optional?: boolean;
  ignoreToday?: boolean;
}
interface Pt {
  day: number;
  total: number;
  date: string;
}

function useWidth(fallback: number): [React.RefObject<HTMLDivElement>, number] {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(fallback);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Rough text width for 11px Archivo, good enough to keep labels apart. */
function textWidth(text: string, size = 11): number {
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += 3;
    else if (/[.,:]/.test(ch)) w += 3;
    else if (/[0-9$]/.test(ch)) w += 6.5;
    else if (/[A-Z]/.test(ch)) w += 7.4;
    else if (/[iljt]/.test(ch)) w += 3.4;
    else if (/[mw]/.test(ch)) w += 9;
    else w += 6;
  }
  return (w * size) / 11;
}

function boxOf(l: { text: string; x: number; y: number; anchor: Anchor }): Box {
  const w = textWidth(l.text);
  const x0 = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2;
  return { x0: x0 - 2, x1: x0 + w + 2, y0: l.y - 10, y1: l.y + 3 };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Points every few pixels along a polyline, so labels can keep off the lines. */
function sample(points: Array<[number, number]>, step = 5): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

/**
 * Place labels in order. Each takes the first candidate that stays inside the
 * plot and clear of labels already placed, points and lines. An optional label
 * with no clean spot is dropped; a required one takes its least bad spot.
 */
function placeLabels(
  wants: Want[],
  bounds: Box,
  obstacles: Box[],
  lines: Array<[number, number]>,
  todayLine: Array<[number, number]>,
): Label[] {
  const placed: Array<Label & { box: Box }> = [];
  for (const want of wants) {
    let best: { label: Label; box: Box; cost: number } | undefined;
    for (const [x, y, anchor] of want.cands) {
      const label = { text: want.text, cls: want.cls, x, y, anchor };
      const box = boxOf(label);
      if (box.x0 < bounds.x0 || box.x1 > bounds.x1 || box.y0 < bounds.y0 || box.y1 > bounds.y1)
        continue;
      let cost = 0;
      const roomy = { ...box, y0: box.y0 - 3, y1: box.y1 + 3 };
      if (placed.some(p => overlaps(p.box, roomy))) cost += 100;
      if (obstacles.some(o => overlaps(o, box))) cost += 20;
      const hit = (pts: Array<[number, number]>) =>
        pts.filter(([px, py]) => px > box.x0 && px < box.x1 && py > box.y0 && py < box.y1).length;
      cost += hit(lines);
      if (!want.ignoreToday) cost += hit(todayLine);
      if (!best || cost < best.cost) best = { label, box, cost };
      if (cost === 0) break;
    }
    if (!best) {
      if (want.optional) continue;
      // Nothing fits inside: clamp the first candidate into the plot.
      const [x, y, anchor] = want.cands[0];
      const box0 = boxOf({ text: want.text, x, y, anchor });
      const dx =
        box0.x0 < bounds.x0 ? bounds.x0 - box0.x0 : box0.x1 > bounds.x1 ? bounds.x1 - box0.x1 : 0;
      const label = { text: want.text, cls: want.cls, x: x + dx, y, anchor };
      best = { label, box: boxOf(label), cost: 0 };
    }
    if (want.optional && best.cost > 0) continue;
    placed.push({ ...best.label, box: best.box });
  }
  return placed;
}

export interface SpendChartProps {
  pace: Pace;
  series: Array<{ date: string; total: number }>;
  /** The conclusion in words, for screen readers. */
  summary: string;
  /** The small chart on an ended grant's card. */
  compact?: boolean;
}

export function SpendChart({ pace, series, summary, compact = false }: SpendChartProps) {
  const [wrapRef, measured] = useWidth(compact ? 340 : 580);
  const [hover, setHover] = React.useState<number | null>(null);

  const W = Math.max(compact ? 220 : 260, measured);
  const H = compact ? 100 : 184;
  const L = compact ? 44 : 48;
  const R = compact ? W - 64 : W - 16;
  const T = compact ? 12 : 24;
  const B = compact ? 72 : 156;
  const narrow = W < 440;

  const start = pace.periodStart;
  const end = pace.periodEnd;
  if (!start || !end || pace.daysTotal <= 0) {
    return <div ref={wrapRef} className="sd-chart-wrap" />;
  }

  const days = pace.daysTotal;
  const yMax = Math.max(pace.budget, pace.spent, 1);
  const xOf = (day: number) => L + (Math.max(0, Math.min(days, day)) / days) * (R - L);
  const yOf = (v: number) => B - (Math.max(0, v) / yMax) * (B - T);
  const dayOf = (iso: string) => differenceInCalendarDays(parseISO(iso), parseISO(start));

  const running = pace.status !== 'period-ended' && pace.status !== 'not-started';
  const ended = pace.status === 'period-ended';

  // The spending line: $0 at the start, then the running total at the end of each day.
  const pts: Pt[] =
    pace.status === 'not-started'
      ? []
      : series.map(p => ({ day: dayOf(p.date) + 1, total: p.total, date: p.date }));
  const line: Array<[number, number]> = pts.length
    ? [[xOf(0), yOf(0)], ...pts.map((p): [number, number] => [xOf(p.day), yOf(p.total)])]
    : [];
  const last = line[line.length - 1];

  // Gridlines: round steps below the award, the award itself on top.
  const ticks: number[] = [];
  if (compact) ticks.push(yMax / 2);
  else {
    const step = niceStep(yMax);
    for (let v = step; v < yMax; v += step) if (yOf(v) - yOf(yMax) >= 14) ticks.push(v);
  }

  // Month ticks on the first of each month.
  const months: Array<{ x: number; label: string }> = [];
  for (let m = startOfMonth(parseISO(start)); format(m, 'yyyy-MM-dd') <= end; m = addMonths(m, 1)) {
    const iso = format(m, 'yyyy-MM-dd');
    if (iso < start) continue;
    months.push({ x: xOf(dayOf(iso)), label: format(m, 'MMM') });
  }
  const gap = months.length > 1 ? months[1].x - months[0].x : R - L;
  const every = compact ? 3 : gap >= 30 ? 1 : gap >= 16 ? 2 : 3;

  // Where today's rate leads.
  let proj:
    | {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
        tone: Tone;
        endLabel: string;
        unspent?: number;
      }
    | undefined;
  const xT = running ? xOf(pace.daysElapsed) : undefined;
  if (running && last && pace.spent <= pace.budget && pace.daysElapsed > 0) {
    const perDay = pace.spent / pace.daysElapsed;
    let endDay = days;
    let endVal = Math.min(pace.budget, perDay * days);
    if (perDay > 0 && perDay * days > pace.budget) {
      endDay = pace.budget / perDay;
      endVal = pace.budget;
    }
    const tone: Tone =
      pace.status === 'spending-fast' ? 'fast' : pace.status === 'spending-slow' ? 'slow' : 'track';
    const runsOut = endDay < days - 0.5;
    const runsOn =
      pace.runsOutOn ?? format(addDays(parseISO(start), Math.floor(endDay)), 'yyyy-MM-dd');
    proj = {
      x0: last[0],
      y0: last[1],
      x1: xOf(endDay),
      y1: yOf(endVal),
      tone,
      endLabel: runsOut
        ? `Runs out ${format(parseISO(runsOn), 'MMM d')}`
        : `${aboutMoney(endVal)} by ${format(parseISO(end), 'MMM d')}`,
      unspent:
        pace.status === 'spending-slow' && !runsOut && pace.budget - endVal > 0
          ? pace.budget - endVal
          : undefined,
    };
  }

  // Labels, most important first.
  const wants: Want[] = [];
  if (xT !== undefined && !compact) {
    wants.push({
      text: 'Today',
      cls: 'sd-lab sd-lab-today',
      ignoreToday: true,
      cands: [
        [xT, T - 10, 'middle'],
        [xT + 4, T - 10, 'start'],
        [xT - 4, T - 10, 'end'],
      ],
    });
  }
  if (last && !compact) {
    const [px, py] = last;
    const t = `Spent ${money(pace.spent)}`;
    wants.push({
      text: t,
      cls: 'sd-lab sd-lab-actual',
      cands: [
        [px - 8, py - 8, 'end'],
        [px + 8, py + 18, 'start'],
        [px + 8, py - 8, 'start'],
        [px - 8, py + 18, 'end'],
        [px + 8, py + 4, 'start'],
      ],
    });
  }
  if (last && compact) {
    wants.push({
      text: money(pace.spent),
      cls: 'sd-lab sd-lab-actual',
      cands: [
        [last[0] + 8, last[1] + 4, 'start'],
        [last[0] + 8, last[1] + 14, 'start'],
      ],
    });
    wants.push({
      text: ended ? 'Ended' : 'Today',
      cls: 'sd-lab sd-lab-muted',
      cands: [[R + 8, B + 4, 'start']],
    });
  }
  if (proj) {
    const cls = `sd-lab sd-lab-${proj.tone}`;
    const { x1, y1 } = proj;
    wants.push({
      text: proj.endLabel,
      cls,
      cands: [
        [x1 + 10, y1 + 16, 'start'],
        [x1 - 10, y1 + 16, 'end'],
        [x1 - 8, y1 + 18, 'end'],
        [x1 - 8, y1 + 28, 'end'],
        [x1 - 8, y1 - 10, 'end'],
        [x1 + 10, y1 - 8, 'start'],
      ],
    });
  }
  if (!compact) {
    wants.push({
      text: `Award ${money(pace.budget)}`,
      cls: 'sd-lab sd-lab-muted',
      cands: [
        [R, T - 6, 'end'],
        [L + 4, T - 6, 'start'],
        [R - 4, T + 14, 'end'],
      ],
    });
  }
  if (proj?.unspent) {
    const mid = (T + proj.y1) / 2 + 4;
    wants.push({
      text: `About ${aboutMoney(proj.unspent)} unspent`,
      cls: 'sd-lab sd-lab-slow sd-lab-strong',
      cands: [
        [R - 8, mid, 'end'],
        [R - 8, proj.y1 + 32, 'end'],
        [R - 8, proj.y1 - 22, 'end'],
      ],
    });
  }
  if (proj && !narrow) {
    const mx = (proj.x0 + proj.x1) / 2;
    const my = (proj.y0 + proj.y1) / 2;
    wants.push({
      text: 'At this rate',
      cls: `sd-lab sd-lab-${proj.tone}`,
      optional: true,
      cands: [
        [mx + 8, my + 14, 'start'],
        [mx - 8, my - 8, 'end'],
        [mx + 8, my - 8, 'start'],
        [mx - 8, my + 14, 'end'],
      ],
    });
  }
  if (!compact && !narrow) {
    const at = (t: number): [number, number] => [L + t * (R - L), B - t * (B - T)];
    const cands: Array<[number, number, Anchor]> = [];
    for (const t of [0.84, 0.3, 0.6, 0.15]) {
      const [x, y] = at(t);
      cands.push([x + 6, y + 16, 'start'], [x - 6, y - 8, 'end']);
    }
    wants.push({ text: 'Even pace', cls: 'sd-lab sd-lab-muted', optional: true, cands });
  }

  const obstacles: Box[] = [];
  if (last) obstacles.push({ x0: last[0] - 5, x1: last[0] + 5, y0: last[1] - 5, y1: last[1] + 5 });
  if (proj) obstacles.push({ x0: proj.x1 - 6, x1: proj.x1 + 6, y0: proj.y1 - 6, y1: proj.y1 + 6 });
  const lineSamples = [
    ...sample(line),
    ...(proj
      ? sample([
          [proj.x0, proj.y0],
          [proj.x1, proj.y1],
        ])
      : []),
    ...(compact
      ? []
      : sample([
          [L, B],
          [R, T],
        ])),
    ...(proj?.unspent
      ? sample([
          [R + 4, T],
          [R + 8, T],
          [R + 8, proj.y1],
          [R + 4, proj.y1],
        ])
      : []),
  ];
  const todaySamples =
    xT !== undefined
      ? sample([
          [xT, T - 6],
          [xT, B],
        ])
      : [];
  const bounds: Box = { x0: L, x1: W - 1, y0: 1, y1: compact ? H - 1 : B - 2 };
  const labels = placeLabels(wants, bounds, obstacles, lineSamples, todaySamples);

  // Hover and keyboard readout: the nearest point on the spending line.
  const hoverPt = hover !== null ? pts[hover] : undefined;
  const pick = (clientX: number, el: SVGSVGElement) => {
    if (!pts.length) return;
    const rect = el.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * W;
    let bestI = 0;
    let bestD = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(xOf(p.day) - vx);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    setHover(bestI);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!pts.length) return;
    const cur = hover ?? pts.length - 1;
    let next = cur;
    if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
    else if (e.key === 'ArrowRight') next = Math.min(pts.length - 1, cur + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = pts.length - 1;
    else if (e.key === 'Escape') {
      setHover(null);
      return;
    } else return;
    e.preventDefault();
    setHover(next);
  };

  const hx = hoverPt ? xOf(hoverPt.day) : 0;
  const hy = hoverPt ? yOf(hoverPt.total) : 0;

  return (
    <div ref={wrapRef} className={`sd-chart-wrap${compact ? ' sd-chart-wrap--compact' : ''}`}>
      <svg
        className="sd-chart"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={summary}
        tabIndex={pts.length ? 0 : undefined}
        onPointerMove={e => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(pts.length ? pts.length - 1 : null)}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
      >
        <line className="sd-grid" x1={L} x2={R} y1={B} y2={B} />
        <text className="sd-ax" x={L - 8} y={B + 3.5} textAnchor="end">
          $0
        </text>
        {ticks.map(v => (
          <g key={v}>
            <line className="sd-grid" x1={L} x2={R} y1={yOf(v)} y2={yOf(v)} />
            <text className="sd-ax" x={L - 8} y={yOf(v) + 3.5} textAnchor="end">
              {shortMoney(v)}
            </text>
          </g>
        ))}
        <line className="sd-award" x1={L} x2={R} y1={yOf(pace.budget)} y2={yOf(pace.budget)} />
        <text className="sd-ax" x={L - 8} y={yOf(pace.budget) + 3.5} textAnchor="end">
          {shortMoney(pace.budget)}
        </text>

        {months.map((m, i) => (
          <g key={`${m.label}-${i}`}>
            <line className="sd-tick" x1={m.x} x2={m.x} y1={B} y2={B + 4} />
            {i % every === 0 && m.x + 20 < W && (
              <text className="sd-ax" x={m.x + 3} y={B + 16}>
                {m.label}
              </text>
            )}
          </g>
        ))}
        <line className="sd-tick" x1={R} x2={R} y1={B} y2={B + 4} />
        <line className="sd-axis" x1={L} x2={R} y1={B} y2={B} />

        <line className="sd-even" x1={L} y1={B} x2={R} y2={yOf(pace.budget)} />
        {xT !== undefined && !compact && (
          <line className="sd-today" x1={xT} x2={xT} y1={T - 6} y2={B} />
        )}
        {proj && (
          <polyline
            className={`sd-proj sd-proj-${proj.tone}`}
            points={`${proj.x0},${proj.y0} ${proj.x1},${proj.y1}`}
          />
        )}
        {proj?.unspent && (
          <path className="sd-gap" d={`M${R + 4},${T} H${R + 8} V${proj.y1} H${R + 4}`} />
        )}
        {line.length > 0 && (
          <polyline className="sd-actual" points={line.map(([x, y]) => `${x},${y}`).join(' ')} />
        )}
        {last && <circle className="sd-pt" cx={last[0]} cy={last[1]} r={3.5} />}
        {proj && <circle className={`sd-pt-${proj.tone}`} cx={proj.x1} cy={proj.y1} r={4} />}

        {labels.map(l => (
          <text key={l.text} className={l.cls} x={l.x} y={l.y} textAnchor={l.anchor}>
            {l.text}
          </text>
        ))}

        {hoverPt && (
          <g aria-hidden="true">
            <line className="sd-hover-line" x1={hx} x2={hx} y1={T} y2={B} />
            <circle className="sd-hover-pt" cx={hx} cy={hy} r={4.5} />
          </g>
        )}
      </svg>
      <div
        className="sd-readout"
        aria-live="polite"
        style={
          hoverPt
            ? { left: Math.max(70, Math.min(W - 70, hx)), top: Math.max(0, hy - 12) }
            : { display: 'none' }
        }
      >
        {hoverPt && (
          <>
            <span className="sd-readout__date">{dateLong(hoverPt.date)}</span>
            <span className="sd-readout__value">{money(hoverPt.total)} spent</span>
          </>
        )}
      </div>
    </div>
  );
}
