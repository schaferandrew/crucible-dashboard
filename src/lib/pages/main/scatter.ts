// Geometry of the quality-vs-time/cost scatter (MAIN-SCAT-01..09). Pure: the component draws it.
// Log x (time and cost span orders of magnitude), a Pareto frontier and the better-than-median quadrant.

import type { Row } from '$lib/core/scoring';
import type { Scope } from '$lib/core/scope';

export type Measure = 'time' | 'cost';

export const xOf = (r: Row, m: Measure): number | null => (m === 'time' ? r.time : r.cost);

/** Rows with an overall score and a positive x. */
export function scatterPoints(rows: readonly Row[], m: Measure): Row[] {
  return rows.filter((r) => {
    const x = xOf(r, m);
    return r.overall.score !== null && x !== null && x > 0;
  });
}

/** In cost mode, local rows with a score but no computable cost are left off (and the sub-text says so). */
export function skippedLocal(rows: readonly Row[], m: Measure): boolean {
  return m === 'cost' && rows.some((r) => r.local && r.overall.score !== null && r.cost === null);
}

export function median(v: number[]): number {
  const s = v.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Points sorted by x ascending, keeping those with a strictly higher score than every faster point. */
export function frontier(points: readonly Row[], m: Measure): Row[] {
  const out: Row[] = [];
  let best = -1;
  for (const r of points.slice().sort((a, b) => xOf(a, m)! - xOf(b, m)!)) {
    if (r.overall.score! > best) {
      out.push(r);
      best = r.overall.score!;
    }
  }
  return out;
}

/** Log10 domain: at least half a decade wide, plus 0.1 of margin either side. */
export function logDomain(xs: number[]): { lo: number; hi: number } {
  let lo = Math.log10(Math.min(...xs));
  let hi = Math.log10(Math.max(...xs));
  if (hi - lo < 0.5) {
    lo -= 0.25;
    hi += 0.25;
  }
  return { lo: lo - 0.1, hi: hi + 0.1 };
}

/** 1x and 3x each power of ten inside the domain. */
export function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(lo); e <= Math.floor(hi); e++)
    for (const k of [1, 3]) {
      const v = k * Math.pow(10, e);
      if (Math.log10(v) >= lo && Math.log10(v) <= hi) out.push(v);
    }
  return out;
}

export interface Dot {
  row: Row;
  n: number; // rank by score, then x (narrow numbering)
  px: number;
  py: number;
  onFrontier: boolean;
  label: boolean;
  flip: boolean;
}

export interface ScatterLayout {
  narrow: boolean;
  width: number;
  height: number;
  m: { top: number; right: number; bottom: number; left: number };
  yTicks: { v: number; y: number }[];
  xTicks: { v: number; x: number }[];
  quadrant: { x: number; y: number; w: number; h: number };
  frontierPath: string;
  dots: Dot[];
}

export function layoutScatter(
  points: readonly Row[],
  m: Measure,
  yMax: number,
  containerWidth: number,
): ScatterLayout {
  const width = Math.max(280, containerWidth || 560);
  const narrow = width < 500;
  const height = narrow ? 300 : 340;
  const mg = narrow
    ? { top: 16, right: 14, bottom: 44, left: 32 }
    : { top: 16, right: 24, bottom: 44, left: 44 };
  const xs = points.map((r) => xOf(r, m)!);
  const { lo, hi } = logDomain(xs);
  const x = (v: number) => mg.left + ((Math.log10(v) - lo) / (hi - lo)) * (width - mg.left - mg.right);
  const y = (v: number) => mg.top + (1 - v / yMax) * (height - mg.top - mg.bottom);
  const medX = median(xs);
  const medY = median(points.map((r) => r.overall.score!));
  const front = frontier(points, m);
  const onFront = new Set(front.map((r) => r.rowKey));
  const labelAll = points.length <= 16;
  const byScore = points
    .slice()
    .sort((a, b) => b.overall.score! - a.overall.score! || xOf(a, m)! - xOf(b, m)!);
  const num = new Map(byScore.map((r, i) => [r.rowKey, i + 1]));
  return {
    narrow,
    width,
    height,
    m: mg,
    yTicks: [0, yMax / 2, yMax].map((v) => ({ v, y: y(v) })),
    xTicks: logTicks(lo, hi).map((v) => ({ v, x: x(v) })),
    quadrant: {
      x: mg.left,
      y: mg.top,
      w: Math.max(0, x(medX) - mg.left),
      h: Math.max(0, y(medY) - mg.top),
    },
    frontierPath:
      front.length > 1
        ? front
            .map((r, i) => `${i ? 'L' : 'M'}${x(xOf(r, m)!).toFixed(1)} ${y(r.overall.score!).toFixed(1)}`)
            .join(' ')
        : '',
    dots: points.map((r) => {
      const px = x(xOf(r, m)!);
      return {
        row: r,
        n: num.get(r.rowKey)!,
        px,
        py: y(r.overall.score!),
        onFrontier: onFront.has(r.rowKey),
        label: !narrow && (labelAll || onFront.has(r.rowKey)),
        // A label that would run past the plot's right edge sits to the left of its point
        flip: px + 9 + r.label.length * 7 > width,
      };
    }),
  };
}

/** The sub-text under the heading (MAIN-SCAT-03). */
export function scatterSub(m: Measure, what: string, skipped: boolean): string {
  return m === 'time'
    ? `${what} against median time per task, for each row's best setup. Up and to the left is better: the shaded corner is faster and better than the median, and the line joins models nothing else beats on both.`
    : `${what} against average cost per task: the API bill for cloud models, the estimated electricity for local ones. Up and to the left is better.` +
        (skipped ? ' Local setups on hardware with no power figure are left off.' : '');
}

export function scatterWhat(sc: Scope, label: string): string {
  const v = sc.view;
  const all = v.aggTiers(sc.ctx.exclude).length === v.tiers.length;
  return `${label} score${
    v.showAgg && !all
      ? ' (' +
        v
          .aggTiers(sc.ctx.exclude)
          .map((t) => t.label)
          .join(', ') +
        ')'
      : ''
  }`;
}
