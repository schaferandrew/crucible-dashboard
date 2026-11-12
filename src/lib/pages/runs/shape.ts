// Shaping for the Runs page (B-05): slim runs from `recent/<month>.json` -> rows for one suite, with the
// filters and sorts the page offers. Pure; the page only draws.

import { outcomeClass, type OutcomeClass } from '$lib/core/outcome';
import { facetValue } from '$lib/core/scope';
import { DIMS, type DataContext } from '$lib/core/context';
import type { Setup, SuiteIndex } from '$lib/core/types';

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export interface SlimState {
  state: string | null;
  task: string | null;
  score: number | null;
}

export interface SlimRun {
  id: string;
  startedAt: string | null;
  setup: string | null;
  model: string | null;
  task: string | null;
  outcome: string | null;
  elapsed: number | null;
  cost: number | null;
  validity: string | null;
  states: Record<string, SlimState>;
}

/** Tolerant read of a monthly shard: a malformed run is skipped, an unknown field ignored. */
export function normalizeShard(raw: unknown): SlimRun[] {
  const runs = rec(raw).runs;
  if (!Array.isArray(runs)) return [];
  const out: SlimRun[] = [];
  for (const r of runs) {
    const o = rec(r);
    const id = str(o.run_uuid);
    if (!id) continue;
    const states: Record<string, SlimState> = {};
    for (const [suite, s] of Object.entries(rec(o.states))) {
      const x = rec(s);
      states[suite] = { state: str(x.state), task: str(x.task), score: num(x.score) };
    }
    out.push({
      id,
      startedAt: str(o.started_at),
      setup: str(o.setup),
      model: str(o.model),
      task: str(o.task),
      outcome: str(o.outcome),
      elapsed: num(o.elapsed_s),
      cost: num(o.cost),
      validity: str(o.validity),
      states,
    });
  }
  return out;
}

// ---- States ----

export const STATE_LABEL: Record<string, string> = {
  counted: 'Counted',
  provisional: 'Provisional',
  older: 'Older version',
  invalid: 'Invalid',
  withdrawn: 'Withdrawn',
  harness: 'Other harness',
  retired: 'Retired task',
  unknown_task: 'Unknown task',
};
/** Known states first, in this order; anything else follows under its raw name (never hidden). */
export const STATE_ORDER = Object.keys(STATE_LABEL);
export const stateLabel = (s: string): string =>
  s === 'none' ? 'Not in this suite' : (STATE_LABEL[s] ?? s.replace(/_/g, ' '));
/** A run marked never-counts: shown with a badge. */
export const isFlagged = (state: string | null, validity: string | null): 'invalid' | 'withdrawn' | null =>
  state === 'withdrawn' || validity === 'withdrawn'
    ? 'withdrawn'
    : state === 'invalid' || validity === 'invalid'
      ? 'invalid'
      : null;

// ---- Rows ----

export interface RunRow {
  id: string;
  startedAt: string | null;
  model: string;
  modelId: string | null;
  setup: Setup | null;
  setupId: string | null;
  taskId: string | null;
  task: string;
  mode: string | null;
  tier: string | null;
  outcome: OutcomeClass;
  /** The run's state in the chosen suite; null when the suite does not know the run. */
  state: string | null;
  flag: 'invalid' | 'withdrawn' | null;
  /** The suite's chosen score for the run (pinned rubric). */
  score: number | null;
  elapsed: number | null;
  cost: number | null;
  local: boolean;
}

export interface TaskInfo {
  name: string | null;
  mode: string | null;
  tier: string | null;
}

export function taskTable(index: SuiteIndex): Map<string, TaskInfo> {
  const m = new Map<string, TaskInfo>();
  for (const t of index.catalog.tasks) m.set(t.id, { name: t.name, mode: t.mode, tier: t.tier });
  return m;
}

const readable = (id: string) => {
  const s = id.replace(/[-_]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function toRow(run: SlimRun, suite: string, index: SuiteIndex, tasks: Map<string, TaskInfo>): RunRow {
  const st = run.states[suite] ?? null;
  const setup = (run.setup && index.entities.setups[run.setup]) || null;
  const taskId = st?.task ?? run.task;
  const info = (taskId && tasks.get(taskId)) || null;
  const modelId = setup?.model ?? run.model;
  return {
    id: run.id,
    startedAt: run.startedAt,
    model:
      setup?.labels.model ?? (modelId && index.entities.models[modelId]?.label) ?? modelId ?? 'Unknown model',
    modelId,
    setup,
    setupId: run.setup,
    taskId,
    task: info?.name ?? (taskId ? readable(taskId) : 'Unknown task'),
    mode: info?.mode ?? null,
    tier: info?.tier ?? null,
    outcome: outcomeClass(run.outcome),
    state: st?.state ?? null,
    flag: isFlagged(st?.state ?? null, run.validity),
    score: st?.score ?? null,
    elapsed: run.elapsed,
    cost: run.cost,
    local: setup?.where === 'local',
  };
}

// ---- Filters ----

export interface RunFilters {
  outcome: OutcomeClass | 'all';
  /** A state id, or `all`. */
  state: string;
}
export const NO_FILTERS: RunFilters = { outcome: 'all', state: 'all' };

/** The facets of the run's setup (panel), its section and tier, then outcome and state. */
export function rowMatches(row: RunRow, ctx: DataContext, f: RunFilters): boolean {
  if (f.outcome !== 'all' && row.outcome !== f.outcome) return false;
  if (f.state !== 'all' && (row.state ?? 'none') !== f.state) return false;
  if (ctx.section !== 'combined' && row.mode !== ctx.section) return false;
  if (row.tier && ctx.exclude.has(row.tier as never)) return false;
  for (const dim of DIMS) {
    const set = ctx.filters[dim];
    if (!set || !set.size) continue;
    if (dim === 'task') {
      if (!row.taskId || !set.has(row.taskId)) return false;
      continue;
    }
    const v = row.setup ? facetValue(row.setup, dim) : null;
    if (v === null || !set.has(v)) return false;
  }
  return true;
}

// ---- Sorts ----

export type SortKey = 'newest' | 'oldest' | 'model' | 'score-high' | 'score-low';
export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'model', label: 'Model name' },
  { key: 'score-high', label: 'Score (high to low)' },
  { key: 'score-low', label: 'Score (low to high)' },
];
export const isSortKey = (v: unknown): v is SortKey => SORTS.some((s) => s.key === v);

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Runs without a date go last in both directions. */
function byDate(a: RunRow, b: RunRow, dir: 1 | -1): number {
  if (!a.startedAt || !b.startedAt) return Number(!a.startedAt) - Number(!b.startedAt);
  return dir * cmp(a.startedAt, b.startedAt) || cmp(a.id, b.id);
}
/** Runs without a score go last in both directions. */
function byScore(a: RunRow, b: RunRow, dir: 1 | -1): number {
  if (a.score === null || b.score === null) return Number(a.score === null) - Number(b.score === null);
  return dir * (a.score - b.score) || byDate(a, b, -1);
}

export function sortRuns(rows: readonly RunRow[], key: SortKey): RunRow[] {
  const out = [...rows];
  switch (key) {
    case 'newest':
      return out.sort((a, b) => byDate(a, b, -1));
    case 'oldest':
      return out.sort((a, b) => byDate(a, b, 1));
    case 'model':
      return out.sort(
        (a, b) =>
          cmp(a.model.toLowerCase(), b.model.toLowerCase()) ||
          cmp(a.modelId ?? '', b.modelId ?? '') ||
          byDate(a, b, -1),
      );
    case 'score-high':
      return out.sort((a, b) => byScore(a, b, -1));
    case 'score-low':
      return out.sort((a, b) => byScore(a, b, 1));
  }
}

// ---- Months ----

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `2026-10` -> `October 2026`; `unknown` -> `runs with no start time`. */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month === 'unknown' ? 'runs with no start time' : month;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** Shard names newest first; `unknown` last. Anything that is not `YYYY-MM` or `unknown` is dropped. */
export function orderMonths(names: readonly string[]): string[] {
  const dated = names.filter((n) => /^\d{4}-\d{2}$/.test(n)).sort((a, b) => cmp(b, a));
  return names.includes('unknown') ? [...dated, 'unknown'] : dated;
}

/** The months of `recent/index.json` (`{months: [{id, runs}]}`), newest first, `unknown` last. Tolerant. */
export function monthsOfIndex(raw: unknown): string[] {
  const months = rec(raw).months;
  if (!Array.isArray(months)) return [];
  return orderMonths(months.map((m) => str(rec(m).id)).filter((id): id is string => id !== null));
}

/** Counts of states among rows, for the state select. */
export function stateCounts(rows: readonly RunRow[]): { state: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.state ?? 'none', (m.get(r.state ?? 'none') ?? 0) + 1);
  const rank = (s: string) => (STATE_ORDER.includes(s) ? STATE_ORDER.indexOf(s) : STATE_ORDER.length);
  return [...m]
    .map(([state, n]) => ({ state, n }))
    .sort((a, b) => rank(a.state) - rank(b.state) || cmp(a.state, b.state));
}
