// Number, time and cost formatting. Pure, and independent of the viewer's locale and time zone: numbers
// use the fixed `en` locale and dates are read from the ISO string as UTC (B-12), so a prerendered page
// and its hydrated copy always agree.

export const NONE = '—';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** One decimal (`7.5`), a dash when unknown. */
export function fmtScore(v: number | null | undefined): string {
  return isNum(v) ? v.toFixed(1) : NONE;
}

/** `4.2s`, `42s`, `3m 05s`, `1h 02m`. */
export function fmtSeconds(v: number | null | undefined): string {
  if (!isNum(v)) return NONE;
  if (v < 60) return v.toFixed(v < 10 ? 1 : 0) + 's';
  if (v < 3600) return Math.floor(v / 60) + 'm ' + String(Math.round(v % 60)).padStart(2, '0') + 's';
  return Math.floor(v / 3600) + 'h ' + String(Math.round((v % 3600) / 60)).padStart(2, '0') + 'm';
}

export function fmtUsd(v: number | null | undefined): string {
  if (!isNum(v)) return NONE;
  if (v === 0) return '$0';
  if (v < 0.0001) return '<$0.0001';
  return '$' + (v < 0.01 ? v.toPrecision(2) : v.toFixed(v < 1 ? 3 : 2));
}

/** A local cost is an electricity estimate, so it gets a leading approximately sign. */
export function fmtCost(v: number | null | undefined, local: boolean): string {
  return (local && isNum(v) ? '≈' : '') + fmtUsd(v);
}

export function fmtInt(v: number | null | undefined): string {
  return isNum(v) ? v.toLocaleString('en') : NONE;
}

/** The date part (`YYYY-MM-DD`) of an ISO timestamp. */
export function fmtDate(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : NONE;
}

export function fmtRepeat(a: { n: number; min: number; max: number } | null | undefined): string {
  if (!a) return NONE;
  if (a.n === 1) return '1 run';
  return (
    a.n + ' runs, ' + (a.min === a.max ? 'all ' + fmtScore(a.min) : fmtScore(a.min) + '–' + fmtScore(a.max))
  );
}

/** Decode speed: one decimal under 10, else a rounded integer. `bare` drops the unit (table cells). */
export function fmtTps(v: number | null | undefined, bare = false): string {
  if (!isNum(v)) return NONE;
  return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + (bare ? '' : ' tok/s');
}

export function tpsTitle(t: { n: number } | null | undefined, of?: number): string {
  if (!t || !t.n) return "Decode speed wasn't recorded for these runs";
  return (
    `Decode speed: median of the ${t.n}` +
    (of ? ` of ${of}` : '') +
    ` run${t.n === 1 ? '' : 's'} that recorded it (output tokens per second of generation, prompt processing excluded)`
  );
}

export function fmtPercent(v: number): string {
  return Math.round(v * 100) + '%';
}

/** `a and b`, `a, b and c`. */
export function listPhrase(items: string[]): string {
  return items.length < 3
    ? items.join(' and ')
    : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

/** Capitalise the first letter. */
export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const HEAT_LIGHT = [234, 242, 251] as const;
const HEAT_DARK = [24, 86, 163] as const;

/** Sequential heat colour for a 0-10 score: light blue to dark blue, text flips to white on the dark half. */
export function heatStyle(score: number | null | undefined): string {
  if (!isNum(score)) return '';
  const t = Math.max(0, Math.min(1, score / 10));
  const rgb = HEAT_LIGHT.map((c, i) => Math.round(c + (HEAT_DARK[i]! - c) * t));
  return `background:rgb(${rgb.join(',')});color:${t > 0.55 ? '#fff' : '#2b2537'}`;
}
