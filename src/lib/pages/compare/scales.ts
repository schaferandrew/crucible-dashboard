// Axes for the two compare charts (CMP-CHART-01, CMP-CHART-03). Pure.

import { TIE } from './pairing';

export interface Axis {
  lo: number;
  hi: number;
  ticks: number[];
  /** Position of a value along the axis, 0..1. */
  pos(v: number): number;
}

/** Score axis: starts at floor(min / 2) * 2, never above 8, and runs to 10. */
export function scoreAxis(values: readonly number[]): Axis & { fromZero: boolean } {
  let lo = values.length ? Math.floor(Math.min(...values) / 2) * 2 : 0;
  if (lo >= 10) lo = 8;
  const step = 10 - lo <= 4 ? 1 : 2;
  const ticks: number[] = [];
  for (let v = lo; v <= 10 + TIE; v += step) ticks.push(v);
  return { lo, hi: 10, ticks, pos: (v) => (v - lo) / (10 - lo), fromZero: lo === 0 };
}

export function scoreAxisNote(axis: { lo: number }): string {
  return axis.lo > 0
    ? `The axis starts at ${axis.lo}, not 0, so gaps look bigger than they would on a full scale.`
    : 'The axis runs from 0 to 10.';
}

/** Log axis with 1/2/5 x 10^n ticks around the data. Null when there is nothing to draw. */
export function timeAxis(values: readonly number[]): Axis | null {
  const v = values.filter((x) => Number.isFinite(x) && x > 0);
  if (!v.length) return null;
  const mn = Math.min(...v);
  const mx = Math.max(...v);
  const cand: number[] = [];
  for (let e = Math.floor(Math.log10(mn)) - 1; e <= Math.ceil(Math.log10(mx)) + 1; e++)
    for (const m of [1, 2, 5]) cand.push(+(m * Math.pow(10, e)).toPrecision(3));
  const lo = cand.filter((x) => x <= mn * (1 + TIE)).pop() ?? mn;
  let hi = cand.find((x) => x >= mx * (1 - TIE)) ?? mx;
  if (!(hi > lo)) hi = lo * 10;
  const span = Math.log(hi) - Math.log(lo);
  return {
    lo,
    hi,
    ticks: cand.filter((x) => x >= lo && x <= hi),
    pos: (x) => (Math.log(x) - Math.log(lo)) / span,
  };
}

/** `30s`, `2m`, `1.5s` axis labels. */
export function niceTime(v: number): string {
  return v >= 60 && v % 60 === 0 ? `${v / 60}m` : `${v}s`;
}

/** Drop ticks closer than `minGap` px to the last kept one (the first is always kept). */
export function thinTicks(ticks: readonly number[], x: (v: number) => number, minGap = 34): number[] {
  const out: number[] = [];
  let last = -Infinity;
  for (const t of ticks) {
    if (out.length && x(t) - last < minGap) continue;
    out.push(t);
    last = x(t);
  }
  return out;
}

/** Vertical nudge for coinciding dots when there are three or more setups; none for two (they are joined). */
export function nudge(offsetAmongEqual: number, sides: number): number {
  return sides === 2 ? 0 : (offsetAmongEqual - 1.5) * 3.4 + 1;
}
