// The A/B block: one variant against another on the same recorded deployment, differing in exactly one
// answer-changing dimension (PAIR-01..09). Pure; the page lays it out. Both sides come from the scope, so a
// filter that rules a setup out also rules it out as a partner.

import { cap, fmtScore } from '$lib/core/format';
import { cellsOf, type View } from '$lib/core/scoring';
import type { CatalogTask, Setup, SuiteIndex } from '$lib/core/types';
import { cellKey, median, type RunsByCell, type SlimRun } from './runs';
import { isRecorded } from './shape';

/** At least this many paired tasks before a "scores x higher" headline is allowed (PAIR-05). */
export const MIN_PAIRED_TASKS = 5;
/** No single task may account for more than this share of the summed difference (PAIR-05). */
export const MAX_TASK_SHARE = 0.5;
/** A difference below this is "the same" (PAIR-04). */
export const SAME_BELOW = 0.05;

export type AbDim = 'weights' | 'reasoning' | 'harness';

export const AB_DIM_LABEL: Record<AbDim, string> = {
  weights: 'weights',
  reasoning: 'reasoning level',
  harness: 'harness',
};

/** The one dimension two setups differ in, or null when they differ in none, several, or one the section doesn't vary. */
export function abDimOf(a: Setup, b: Setup, harnessAllowed: boolean): AbDim | null {
  const diffs: AbDim[] = [];
  if (a.artifact !== b.artifact) diffs.push('weights');
  if (a.reasoning !== b.reasoning) diffs.push('reasoning');
  if (a.harness !== b.harness) diffs.push('harness');
  if (diffs.length !== 1) return null;
  const d = diffs[0]!;
  if (d === 'harness' && !harnessAllowed) return null;
  return d;
}

/** Active tasks both setups have counted runs of. */
export function sharedTasks(index: SuiteIndex, view: View, a: Setup, b: Setup): CatalogTask[] {
  const ca = cellsOf(index, a.id);
  const cb = cellsOf(index, b.id);
  return view.tasks.filter(
    (t) =>
      t.status === 'active' &&
      (ca.get(t.id)?.counted?.n_scored ?? 0) > 0 &&
      (cb.get(t.id)?.counted?.n_scored ?? 0) > 0,
  );
}

export interface AbCandidate {
  setup: Setup;
  dim: AbDim;
  shared: number;
}

/** Partners of `base` among `setups`: same recorded deployment, one dimension apart, sharing at least one task. */
export function abCandidates(
  index: SuiteIndex,
  view: View,
  base: Setup,
  setups: readonly Setup[],
): AbCandidate[] {
  if (view.kind === 'combined' || !isRecorded(base)) return [];
  const harnessAllowed = view.harnesses.length > 1;
  const out: AbCandidate[] = [];
  for (const s of setups) {
    if (s.id === base.id || s.deployment !== base.deployment) continue;
    const dim = abDimOf(base, s, harnessAllowed);
    if (!dim) continue;
    const shared = sharedTasks(index, view, base, s).length;
    if (shared) out.push({ setup: s, dim, shared });
  }
  return out.sort((x, y) => y.shared - x.shared || x.setup.id.localeCompare(y.setup.id));
}

export interface AbPair {
  task: CatalogTask;
  /** Mean of the finished scored runs, null when a side didn't finish one. */
  a: number | null;
  b: number | null;
  counted: boolean;
}

export interface AbSpeed {
  a: number | null;
  b: number | null;
  ratio: number | null;
  n: number;
  faster: number;
  slower: number;
}

export interface AbNotFinished {
  side: 'a' | 'b';
  task: CatalogTask;
  k: number;
  n: number;
  run: SlimRun | null;
}

export interface AbResult {
  shared: number;
  pairs: AbPair[];
  diffs: number[];
  speed: AbSpeed | null;
  notFinished: AbNotFinished[];
}

const finishedMedian = (list: readonly SlimRun[] | undefined) =>
  median(
    (list ?? []).filter((r) => r.state === 'counted' && r.outcome === 'finished').map((r) => r.elapsed_s),
  );

export function compareSetups(
  index: SuiteIndex,
  view: View,
  a: Setup,
  b: Setup,
  runs: RunsByCell | null,
): AbResult {
  const ca = cellsOf(index, a.id);
  const cb = cellsOf(index, b.id);
  const tasks = sharedTasks(index, view, a, b);
  const pairs: AbPair[] = tasks.map((task) => {
    const x = ca.get(task.id)?.counted;
    const y = cb.get(task.id)?.counted;
    const okA = (x?.n_finished ?? 0) > 0 && typeof x?.mean_finished === 'number';
    const okB = (y?.n_finished ?? 0) > 0 && typeof y?.mean_finished === 'number';
    return { task, a: okA ? x!.mean_finished : null, b: okB ? y!.mean_finished : null, counted: okA && okB };
  });
  const diffs = pairs.filter((p) => p.counted).map((p) => p.b! - p.a!);

  const notFinished: AbNotFinished[] = [];
  for (const task of tasks) {
    for (const [side, setup, cell] of [
      ['a', a, ca.get(task.id)?.counted],
      ['b', b, cb.get(task.id)?.counted],
    ] as const) {
      const k = (cell?.timeouts ?? 0) + (cell?.errors ?? 0);
      if (!k) continue;
      const list = runs?.get(cellKey(setup.id, task.id));
      const run = list?.find((r) => r.state === 'counted' && r.outcome !== 'finished') ?? null;
      notFinished.push({ side, task, k, n: cell?.n ?? k, run });
    }
  }

  let speed: AbSpeed | null = null;
  if (runs) {
    const ratios: number[] = [];
    const ta: number[] = [];
    const tb: number[] = [];
    for (const p of pairs.filter((q) => q.counted)) {
      const x = finishedMedian(runs.get(cellKey(a.id, p.task.id)));
      const y = finishedMedian(runs.get(cellKey(b.id, p.task.id)));
      if (x === null || y === null || x <= 0) continue;
      ta.push(x);
      tb.push(y);
      ratios.push(y / x);
    }
    if (ratios.length)
      speed = {
        a: median(ta),
        b: median(tb),
        ratio: median(ratios),
        n: ratios.length,
        faster: ratios.filter((r) => r < 1).length,
        slower: ratios.filter((r) => r > 1).length,
      };
  }
  return { shared: tasks.length, pairs, diffs, speed, notFinished };
}

/** The summary sentence (PAIR-05/06): a "scores x higher" headline only when it is allowed. */
export function abSentence(r: Pick<AbResult, 'shared' | 'diffs'>, aText: string, bText: string): string {
  const n = r.diffs.length;
  if (!r.shared) return 'No task in common.';
  if (!n) return `No task both finished, of the ${r.shared} both ran.`;
  const task = n === 1 ? 'task' : 'tasks';
  const mean = r.diffs.reduce((x, y) => x + y, 0) / n;
  if (Math.abs(mean) < SAME_BELOW)
    return `${cap(bText)} scores the same as ${aText} on ${n} shared finished ${task}.`;
  const total = r.diffs.reduce((x, y) => x + Math.abs(y), 0);
  const top = Math.max(...r.diffs.map(Math.abs));
  const dominated = total > 0 && top / total > MAX_TASK_SHARE;
  if (n >= MIN_PAIRED_TASKS && !dominated)
    return `${cap(bText)} scores ${fmtScore(Math.abs(mean))} ${mean > 0 ? 'higher' : 'lower'} than ${aText} on average on ${n} shared finished ${task}.`;
  const k = r.diffs.filter((d) => Math.abs(d) >= SAME_BELOW).length;
  return `${cap(aText)} and ${bText} differ on ${k} of ${n} shared finished ${task}${dominated ? ' (one task accounts for most of the difference)' : ''}.`;
}

/** How B's time per task compares with A's (the median of the per-task ratios). Empty when there is nothing to say. */
export function speedPhrase(sp: AbSpeed | null, bText: string): string {
  if (!sp || sp.ratio === null || !sp.n) return '';
  const r = sp.ratio;
  const f = r >= 1 ? r : 1 / r;
  if (f < 1.05) return 'Task by task, the two take about the same time at the median.';
  const word = r > 1 ? 'slower' : 'faster';
  const k = r > 1 ? sp.slower : sp.faster;
  const times = (f < 10 ? f.toFixed(1) : String(Math.round(f))) + '×';
  const where =
    k === sp.n
      ? sp.n === 1
        ? 'on the one timed task'
        : `on every one of the ${sp.n} timed tasks`
      : `on ${k} of ${sp.n} timed tasks`;
  return `${cap(bText)} is ${word} ${where}, by ${times} at the median task.`;
}
