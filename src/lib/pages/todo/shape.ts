// What to run next: the pure logic (TODO-DATA-*, TODO-PICK-*). From a section's cells and the typical task
// times it works out, for each setup, which scored tasks still have no counted mean, why, and what bringing
// the setup to full coverage would take. Nothing here knows a task, section, tier or threshold by name.

import { fmtSeconds, NONE } from '$lib/core/format';
import type { Cell } from '$lib/core/types';

export const SORT_KEYS = ['easiest', 'fewest', 'time', 'score', 'model'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  easiest: 'Easiest to finish',
  fewest: 'Fewest tasks left',
  time: 'Least estimated time',
  score: 'Best score so far',
  model: 'Model name',
};

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function median(values: readonly number[]): number | null {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

// ---- Times ----

/** The part of a slim run (`<suite>/tasks/<task>.json`) the estimates need. Every field may be missing. */
export interface TimeRun {
  setup?: unknown;
  state?: unknown;
  outcome?: unknown;
  elapsed_s?: unknown;
}

/** Runs that sit in a cell: the states the cells table covers. Withdrawn, retired and unknown-task runs don't. */
const NOT_IN_CELLS = new Set(['withdrawn', 'retired', 'unknown_task']);

export interface TaskTimes {
  /** A task's typical time: the median finished time over every setup of the suite (TODO-DATA-04). */
  typical(task: string): number | null;
  /** This setup's own pace: the median of (its finished time / the task's typical time); 1 when none. */
  pace(setup: string, tasks: readonly string[]): number;
}

export function buildTimes(runsByTask: ReadonlyMap<string, readonly TimeRun[]>): TaskTimes {
  const typical = new Map<string, number | null>();
  const own = new Map<string, Map<string, number[]>>();
  for (const [task, runs] of runsByTask) {
    const all: number[] = [];
    for (const r of runs) {
      if (!r || r.outcome !== 'finished' || NOT_IN_CELLS.has(String(r.state))) continue;
      const v = r.elapsed_s;
      if (typeof v !== 'number' || !Number.isFinite(v) || typeof r.setup !== 'string') continue;
      all.push(v);
      let byTask = own.get(r.setup);
      if (!byTask) own.set(r.setup, (byTask = new Map()));
      const list = byTask.get(task);
      if (list) list.push(v);
      else byTask.set(task, [v]);
    }
    typical.set(task, median(all));
  }
  return {
    typical: (task) => typical.get(task) ?? null,
    pace(setup, tasks) {
      const ratios: number[] = [];
      for (const t of tasks) {
        const ty = typical.get(t);
        if (!ty) continue;
        for (const v of own.get(setup)?.get(t) ?? []) ratios.push(v / ty);
      }
      return median(ratios) ?? 1;
    },
  };
}

export const NO_TIMES: TaskTimes = { typical: () => null, pace: () => 1 };

// ---- One setup's tasks left ----

export interface TaskLite {
  id: string;
  name: string;
  /** Tier label, or null when the task has none. */
  tier: string | null;
}

export type WhyKind = 'not-run' | 'awaiting-score' | 'failed' | 'older';

export interface LeftTask {
  task: TaskLite;
  /** Why the task has no counted mean (TODO-DATA-03). */
  why: string;
  kind: WhyKind;
  /** Counted runs of this task that did not finish. */
  fails: number;
  /** Estimated time to run it, or null (unknown, or awaiting score). */
  time: number | null;
}

export interface Left {
  tasks: LeftTask[];
  /** Tasks to run: everything left except those awaiting a score. */
  toRun: number;
  /** Tasks with a failed counted run. */
  failed: number;
  awaiting: number;
  est: number;
  /** Tasks to run with no time estimate. */
  unknown: number;
  effort: number;
  pace: number;
}

/** Class slug of a why (TODO-TABLE-04): "failed 2×" -> `is-failed`, "timed out" -> `is-timed-out`, "not run" -> none. */
export function whyClass(why: string): string {
  if (why === 'not run') return '';
  const slug = why
    .replace(/ \d+×$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `is-${slug}` : '';
}

const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * The tasks of `tasks` (the section's scored tasks, in display order) that the setup has no counted mean for,
 * or null when it has one for all of them (TODO-DATA-02..05). `cells` are the setup's cells by task id.
 */
export function computeLeft(
  setup: string,
  tasks: readonly TaskLite[],
  cells: ReadonlyMap<string, Cell>,
  times: TaskTimes,
): Left | null {
  const pace = times.pace(
    setup,
    tasks.map((t) => t.id),
  );
  const out: LeftTask[] = [];
  let est = 0,
    unknown = 0,
    failed = 0,
    awaiting = 0;
  for (const task of tasks) {
    const cell = cells.get(task.id);
    const counted = cell?.counted;
    if (counted && n0(counted.n_scored) > 0 && typeof counted.mean === 'number') continue;
    const n = n0(counted?.n);
    let why = 'not run';
    let kind: WhyKind = 'not-run';
    let fails = 0;
    if (counted && n > 0) {
      const timeouts = n0(counted.timeouts),
        errors = n0(counted.errors);
      fails = timeouts + errors;
      const finished = n - fails;
      // A finished counted run with no score record is waiting to be scored
      if (finished > n0(counted.n_finished)) {
        why = 'awaiting score';
        kind = 'awaiting-score';
        awaiting += 1;
      } else if (fails) {
        // One failure says how it failed; several only say how many
        why = fails === 1 ? (timeouts ? 'timed out' : 'harness error') : `failed ${fails}×`;
        kind = 'failed';
        failed += 1;
      }
    } else if (n0(cell?.runs) > 0) {
      why = 'only older or uncounted runs';
      kind = 'older';
    }
    const typical = times.typical(task.id);
    const time = kind === 'awaiting-score' || typical === null ? null : typical * pace;
    if (kind !== 'awaiting-score') {
      if (time === null) unknown += 1;
      else est += time;
    }
    out.push({ task, why, kind, fails, time });
  }
  if (!out.length) return null;
  const toRun = out.filter((x) => x.kind !== 'awaiting-score');
  // Effort: tasks to run, each one the setup already failed on counting extra (up to 3 more)
  const effort = toRun.reduce((s, x) => s + 1 + Math.min(x.fails, 3), 0);
  return { tasks: out, toRun: toRun.length, failed, awaiting, est, unknown, effort, pace };
}

// ---- Entries, ordering, text ----

export interface Entry<S = unknown> {
  /** Stable key (the candidate's id). */
  key: string;
  label: string;
  /** The setup's overall score so far, or null. */
  score: number | null;
  left: Left;
  /** The caller's own record (the leaderboard stats of the setup). */
  stat: S;
}

export function compareEntries(sort: SortKey): (a: Entry, b: Entry) => number {
  const byName = (a: Entry, b: Entry) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
  const score = (e: Entry) => (e.score === null ? -1 : e.score);
  return (a, b) => {
    const A = a.left,
      B = b.left;
    switch (sort) {
      case 'model':
        return byName(a, b);
      case 'score':
        return score(b) - score(a) || A.tasks.length - B.tasks.length || byName(a, b);
      case 'time':
        return A.est - B.est || A.tasks.length - B.tasks.length || byName(a, b);
      case 'fewest':
        return A.tasks.length - B.tasks.length || A.est - B.est || byName(a, b);
      default:
        return A.effort - B.effort || A.est - B.est || score(b) - score(a) || byName(a, b);
    }
  };
}

export function sortEntries<S>(entries: readonly Entry<S>[], sort: SortKey): Entry<S>[] {
  return entries.slice().sort(compareEntries(sort));
}

/** "scoring only", "—" (nothing timed), or "≈ 12m 03s + 2 untimed tasks" (TODO-DATA-07). */
export function estimateText(l: Pick<Left, 'toRun' | 'unknown' | 'est'>): string {
  if (!l.toRun) return 'scoring only';
  if (l.unknown === l.toRun) return NONE;
  return `≈ ${fmtSeconds(l.est)}${l.unknown ? ` + ${plural(l.unknown, 'untimed task')}` : ''}`;
}

/** "3 models with tasks left of 12 scored tasks; 2 already complete." (TODO-DATA-08); '' when no entries. */
export function countsLine(entries: number, all: boolean, scoredTasks: number, complete: number): string {
  if (!entries) return '';
  return (
    `${plural(entries, all ? 'setup' : 'model')} with tasks left of ${plural(scoredTasks, 'scored task')}` +
    (complete ? `; ${complete} already complete.` : '.')
  );
}

export interface Recommendation<S = unknown> {
  entry: Entry<S>;
  /** Its tasks to run, never-failed first, then quickest (unknown last) (TODO-PICK-03). */
  order: LeftTask[];
  /** Up to three further entries with tasks to run (TODO-PICK-04). */
  then: Entry<S>[];
}

/** The recommendation: the first entry in `easiest` order that still has tasks to run, else the first. */
export function recommend<S>(entries: readonly Entry<S>[]): Recommendation<S> | null {
  if (!entries.length) return null;
  const ranked = sortEntries(entries, 'easiest');
  const entry = ranked.find((e) => e.left.toRun) ?? ranked[0]!;
  const order = entry.left.tasks
    .filter((x) => x.kind !== 'awaiting-score')
    .sort((a, b) => a.fails - b.fails || (a.time ?? Infinity) - (b.time ?? Infinity));
  const then = ranked.filter((x) => x !== entry && x.left.toRun).slice(0, 3);
  return { entry, order, then };
}
