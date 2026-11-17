// Geometry of the leaderboard column chart (MAIN-BARS-01..05). Pure: the component draws what this returns.
// Wide: columns with the value on the cap and the name angled under the axis. Narrow: one horizontal bar
// per row with its name above, so no label is cut or rotated.

import type { Row } from '$lib/core/scoring';

/** Rows the chart plots: those with an overall score; in-progress last, partial after complete, best first. */
export function barRows(rows: readonly Row[]): Row[] {
  return rows
    .filter((r) => r.overall.score !== null)
    .sort(
      (a, b) =>
        Number(a.inProgress) - Number(b.inProgress) ||
        Number(a.overall.partial) - Number(b.overall.partial) ||
        b.overall.score! - a.overall.score!,
    );
}

/** "qwen3.6-35b-a3b · on": the reasoning level is what tells two rows of a model apart (B-15). */
export function barName(r: Pick<Row, 'label' | 'inProgress'>): string {
  return r.label.replace(/ \(reasoning ([^)]+)\)$/, ' · $1') + (r.inProgress ? ' *' : '');
}

/** At most 29 characters and an ellipsis past 30 (B-15). */
export function shortName(name: string): string {
  return name.length > 30 ? name.slice(0, 29) + '…' : name;
}

export interface Bar {
  row: Row;
  kind: 'local' | 'cloud';
  name: string;
  /** Name as drawn (cut in the wide layout). */
  shown: string;
  score: number;
  /** The bar rectangle. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The focusable hit area. */
  hx: number;
  hy: number;
  hw: number;
  hh: number;
  /** Where the value text sits, and the name text. */
  vx: number;
  vy: number;
  nx: number;
  ny: number;
  path: string;
}

export interface BarLayout {
  narrow: boolean;
  width: number;
  height: number;
  /** y axis lines (wide only). */
  ticks: { v: number; y: number }[];
  baseline: number;
  left: number;
  right: number;
  bars: Bar[];
}

/** A column is square at the baseline and rounded (4 px) at its data end. */
export function barPath(p: { x: number; y: number; w: number; h: number }, narrow: boolean): string {
  const r = Math.min(4, p.w / 2, p.h / 2);
  const { x, y, w, h } = p;
  if (narrow)
    return `M${x} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x}Z`;
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
}

export function layoutBars(rows: readonly Row[], yMax: number, width: number, narrow: boolean): BarLayout {
  const bars: Bar[] = [];
  const base = {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    hx: 0,
    hy: 0,
    hw: 0,
    hh: 0,
    vx: 0,
    vy: 0,
    nx: 0,
    ny: 0,
    path: '',
  };
  const mk = (row: Row, name: string, shown: string): Bar => ({
    ...base,
    row,
    kind: row.local ? 'local' : 'cloud',
    name,
    shown,
    score: row.overall.score!,
  });
  if (narrow) {
    const rowH = 38;
    const m = { top: 4, right: 44, left: 0 };
    const bw = width - m.left - m.right;
    rows.forEach((row, i) => {
      const y0 = m.top + i * rowH;
      const name = barName(row);
      const b = mk(row, name, name);
      const len = Math.max(2, (b.score / yMax) * bw);
      Object.assign(b, {
        nx: 0,
        ny: y0 + 12,
        x: m.left,
        y: y0 + 18,
        w: len,
        h: 12,
        hx: 0,
        hy: y0,
        hw: width,
        hh: rowH,
        vx: m.left + len + 6,
        vy: y0 + 28,
      });
      b.path = barPath(b, true);
      bars.push(b);
    });
    return {
      narrow,
      width,
      height: m.top + rows.length * rowH,
      ticks: [],
      baseline: 0,
      left: 0,
      right: m.right,
      bars,
    };
  }
  const first = rows[0] ? barName(rows[0]) : '';
  const m = { top: 22, right: 8, bottom: 136, left: 36 };
  // The first name runs down-left from its column: leave room for it
  m.left = Math.max(56, Math.min(120, Math.min(30, first.length) * 5.2));
  const plotH = 300 - m.top - m.bottom + 100;
  const height = m.top + plotH + m.bottom;
  const n = Math.max(1, rows.length);
  // A column always gets 56 px of room (24 px bar): a long list is wider than the box and scrolls inside it
  const slot = 56;
  const pad = 40; // room for the first angled name
  const total = Math.max(width, m.left + pad + n * slot + m.right);
  const bwid = Math.min(24, slot * 0.62);
  const yv = (v: number) => m.top + (1 - v / yMax) * plotH;
  rows.forEach((row, i) => {
    const cx = m.left + pad + slot * (i + 0.5);
    const name = barName(row);
    const b = mk(row, name, shortName(name));
    const top = yv(b.score);
    Object.assign(b, {
      x: cx - bwid / 2,
      y: top,
      w: bwid,
      h: Math.max(2, yv(0) - top),
      hx: cx - slot / 2,
      hy: m.top,
      hw: slot,
      hh: plotH + m.bottom,
      vx: cx,
      vy: top - 6,
      nx: cx + 4,
      ny: yv(0) + 12,
    });
    b.path = barPath(b, false);
    bars.push(b);
  });
  return {
    narrow,
    width: total,
    height,
    ticks: [0, yMax / 2, yMax].map((v) => ({ v, y: yv(v) })),
    baseline: yv(0),
    left: m.left,
    right: m.right,
    bars,
  };
}
