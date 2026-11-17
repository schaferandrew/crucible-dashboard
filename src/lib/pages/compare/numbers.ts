// The numbers of the compare page (CMP-NUM-01..04, CMP-SUM-01, CMP-REL-01/03). Pure.
//
// Scores and "didn't finish" counts come from the suite's cells (always available). Time, decode speed, cost
// and the individual unfinished runs come from the tasks' slim runs, fetched afterwards; until they are
// there those figures are null and `timesLoaded` is false.
//
// A task is *shared* when every side has a counted run of it; *paired* when every side also has a finished,
// scored run. Only paired tasks enter any score, tier, time or cost figure.

import { mean, median, TIE, type Outcome } from './pairing';

export interface NumTask {
  id: string;
  name: string;
  tier: string | null;
}

/** The part of a cell's counted block the page reads. */
export interface CountedBlock {
  n: number;
  n_finished: number;
  mean_finished: number | null;
  timeouts: number;
  errors: number;
}

export interface RunInfo {
  uuid: string;
  startedAt: string | null;
  outcome: Outcome;
  score: number | null;
  elapsed: number | null;
  tps: number | null;
  cost: number | null;
}

export interface NumSide {
  /** The side's counted block by task id (members of a Combined side merged). */
  counted: ReadonlyMap<string, CountedBlock>;
  /** Its counted slim runs by task id, once loaded. */
  runs?: ReadonlyMap<string, readonly RunInfo[]>;
}

export interface Unfinished {
  task: NumTask;
  /** Unfinished runs of the task / all its counted runs. */
  k: number;
  n: number;
  timeouts: number;
  errors: number;
  /** The runs themselves, once loaded. */
  runs: RunInfo[];
}

export interface SideCell {
  runs: number;
  /** Finished, scored runs. */
  finished: number;
  score: number | null;
  time: number | null;
  cost: number | null;
  bad: Unfinished | null;
}

export interface SideRow {
  /** Mean of the paired tasks' finished scores. */
  mean: number | null;
  /** Paired tasks on which this side is (tied) best. */
  top: number;
  /** Median over paired tasks of the per-task median finished time. */
  time: number | null;
  tps: { value: number | null; n: number };
  /** Finished runs behind the decode speed. */
  finishedRuns: number;
  /** Mean over paired tasks of the per-task mean cost per run ("mean of per-task means", B-09). */
  cost: number | null;
  /** Shared tasks the side did not finish (at least one run). */
  bad: Unfinished[];
}

export interface TierColumn {
  tier: string;
  n: number;
  scores: (number | null)[];
}

export interface Numbers {
  shared: NumTask[];
  paired: NumTask[];
  /** `cells[side][shared task]` */
  cells: SideCell[][];
  /** `score[side][paired task]` */
  score: (number | null)[][];
  time: (number | null)[][];
  /** Best score of each paired task. */
  tops: number[];
  tiers: TierColumn[];
  rows: SideRow[];
  timesLoaded: boolean;
}

function cellOf(side: NumSide, task: NumTask): SideCell {
  const b = side.counted.get(task.id)!;
  const runs = side.runs?.get(task.id);
  const finRuns = runs?.filter((r) => r.outcome === 'finished' && r.score !== null) ?? [];
  const badRuns = runs?.filter((r) => r.outcome !== 'finished') ?? [];
  const k = b.timeouts + b.errors;
  return {
    runs: b.n,
    finished: b.n_finished,
    score: b.n_finished > 0 ? b.mean_finished : null,
    time: runs ? median(finRuns.map((r) => r.elapsed)) : null,
    cost: runs ? mean(runs.map((r) => r.cost)) : null,
    bad: k > 0 ? { task, k, n: b.n, timeouts: b.timeouts, errors: b.errors, runs: badRuns } : null,
  };
}

export function computeNumbers(
  sides: readonly NumSide[],
  tasks: readonly NumTask[],
  tiers: readonly { id: string }[],
): Numbers {
  const shared = tasks.filter(
    (t) => sides.length > 0 && sides.every((s) => (s.counted.get(t.id)?.n ?? 0) > 0),
  );
  const cells = sides.map((s) => shared.map((t) => cellOf(s, t)));
  const idx: number[] = [];
  shared.forEach((_, i) => {
    if (cells.every((row) => row[i]!.score !== null)) idx.push(i);
  });
  const pick = <T>(f: (c: SideCell) => T) => cells.map((row) => idx.map((i) => f(row[i]!)));
  const score = pick((c) => c.score);
  const time = pick((c) => c.time);
  const cost = pick((c) => c.cost);
  const paired = idx.map((i) => shared[i]!);
  const tops = paired.map((_, j) => Math.max(...score.map((row) => row[j]!)));
  const tierCols: TierColumn[] = [];
  for (const tier of tiers) {
    const js = paired.map((t, j) => (t.tier === tier.id ? j : -1)).filter((j) => j >= 0);
    if (js.length)
      tierCols.push({
        tier: tier.id,
        n: js.length,
        scores: score.map((row) => mean(js.map((j) => row[j]!))),
      });
  }
  const timesLoaded = sides.length > 0 && sides.every((s) => !!s.runs);
  const rows: SideRow[] = sides.map((side, k) => {
    // Decode speed is the median over the finished runs of the paired tasks
    const tps: number[] = [];
    let finishedRuns = 0;
    if (side.runs) {
      for (const t of paired) {
        for (const r of side.runs.get(t.id) ?? []) {
          if (r.outcome !== 'finished' || r.score === null) continue;
          finishedRuns += 1;
          if (typeof r.tps === 'number' && r.tps > 0) tps.push(r.tps);
        }
      }
    }
    return {
      mean: mean(score[k]!),
      top: score[k]!.filter((v, j) => v! + TIE >= tops[j]!).length,
      time: timesLoaded ? median(time[k]!) : null,
      tps: { value: tps.length ? median(tps) : null, n: tps.length },
      finishedRuns,
      cost: timesLoaded ? mean(cost[k]!) : null,
      bad: cells[k]!.map((c) => c.bad).filter((b): b is Unfinished => !!b),
    };
  });
  return { shared, paired, cells, score, time, tops, tiers: tierCols, rows, timesLoaded };
}

/** The best (highest) of the numbers, or null when fewer than two are known (CMP-SUM-01 highlights only then). */
export function bestOf(values: readonly (number | null)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number');
  return v.length > 1 ? Math.max(...v) : null;
}

export interface SpreadRow {
  task: NumTask;
  /** One score per side. */
  values: number[];
  spread: number;
  /** Position among the paired tasks (the tie-break). */
  order: number;
}

/** Paired tasks by spread (best minus worst), widest first, then original order (CMP-DIFF-02). */
export function spreadRows(n: Numbers): SpreadRow[] {
  const rows = n.paired.map((task, i) => {
    const values = n.score.map((row) => row[i]!);
    return { task, values, spread: Math.max(...values) - Math.min(...values), order: i };
  });
  return rows.sort((a, b) => b.spread - a.spread || a.order - b.order);
}

/** More than five tied tasks fold into one line (CMP-DIFF-03). */
export const TIED_FOLD_OVER = 5;
export const foldsTies = (rows: readonly SpreadRow[]) =>
  rows.filter((r) => r.spread < TIE).length > TIED_FOLD_OVER;

/** Newest finished, scored run first (CMP-DIFF-04). */
export function newestFinished(runs: readonly RunInfo[] | undefined): {
  newest: RunInfo | null;
  count: number;
} {
  const fin = (runs ?? [])
    .filter((r) => r.outcome === 'finished' && r.score !== null)
    .sort((a, b) =>
      (a.startedAt ?? '') < (b.startedAt ?? '') ? 1 : (a.startedAt ?? '') > (b.startedAt ?? '') ? -1 : 0,
    );
  return { newest: fin[0] ?? null, count: fin.length };
}
