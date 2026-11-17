// The model page's per-run data: `<suite>/models/<model>.json` (every run of the model in the suite, slim),
// fetched on demand, and the pure helpers that turn it into the deployment, task and A/B numbers.

import { base } from '$app/paths';

export interface SlimRun {
  run_uuid: string;
  setup: string;
  state: string;
  score: number | null;
  /** `finished`, `timed_out` or `error`. */
  outcome: string | null;
  elapsed_s: number | null;
  tps: number | null;
  cost: number | null;
  started_at: string | null;
  machine: string | null;
  task: string;
}

export interface ModelRuns {
  suite: string;
  model: string;
  runs: SlimRun[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Tolerant reader: a run without a uuid, setup or task is skipped; nothing else is required. */
export function normalizeModelRuns(raw: unknown, suite: string, model: string): ModelRuns {
  const list = (raw as { runs?: unknown })?.runs;
  const runs: SlimRun[] = [];
  if (Array.isArray(list)) {
    for (const r of list as Record<string, unknown>[]) {
      if (!r || typeof r !== 'object') continue;
      const uuid = str(r.run_uuid);
      const setup = str(r.setup);
      const task = str(r.task);
      if (!uuid || !setup || !task) continue;
      runs.push({
        run_uuid: uuid,
        setup,
        state: str(r.state) ?? 'unknown',
        score: num(r.score),
        outcome: str(r.outcome),
        elapsed_s: num(r.elapsed_s),
        tps: num(r.tps),
        cost: num(r.cost),
        started_at: str(r.started_at),
        machine: str(r.machine),
        task,
      });
    }
  }
  return { suite, model, runs };
}

/** The file of a model id (`qwen/qwen3.5-9b` -> `qwen__qwen3.5-9b`). */
export const modelFile = (model: string) => model.replace(/\//g, '__');

export async function loadModelRuns(
  fetchFn: typeof fetch,
  suite: string,
  model: string,
): Promise<ModelRuns | null> {
  const path = `${suite}/models/${modelFile(model)}.json`;
  let raw: unknown;
  if (import.meta.env.SSR) {
    try {
      const [{ readFile }, { resolve }] = await Promise.all([
        import('node:fs/promises'),
        import('node:path'),
      ]);
      raw = JSON.parse(await readFile(resolve('static/data', path), 'utf8'));
    } catch {
      return null;
    }
  } else {
    const res = await fetchFn(`${base}/data/${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
    raw = await res.json();
  }
  return normalizeModelRuns(raw, suite, model);
}

// ---- Numbers ----

export function median(values: readonly (number | null | undefined)[]): number | null {
  const v = values
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    .sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

export function mean(values: readonly (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export const outcomeText = (o: string | null): string =>
  o === 'finished' ? 'finished' : o === 'timed_out' ? 'timed out' : 'errored';

export interface DepStats {
  runs: number;
  finished: number;
  timedOut: number;
  errors: number;
  /** Median over tasks of the task's median finished time; null when no run finished. */
  time: number | null;
  /** The same over all runs, shown as "(none finished)" when `time` is null. */
  timeAll: number | null;
  tps: { median: number | null; n: number };
  /** Mean over tasks of the task's mean cost; null when unknown. */
  cost: number | null;
}

/** Which of a model's runs a block counts: the given setups, the states that count, the shown tasks. */
export interface RunFilter {
  setups: ReadonlySet<string>;
  tasks: ReadonlySet<string>;
  states: ReadonlySet<string>;
}

export function pickRuns(runs: readonly SlimRun[], f: RunFilter): SlimRun[] {
  return runs.filter((r) => f.setups.has(r.setup) && f.states.has(r.state) && f.tasks.has(r.task));
}

function byTask(runs: readonly SlimRun[]): Map<string, SlimRun[]> {
  const m = new Map<string, SlimRun[]>();
  for (const r of runs) {
    const l = m.get(r.task);
    if (l) l.push(r);
    else m.set(r.task, [r]);
  }
  return m;
}

export function depStats(runs: readonly SlimRun[]): DepStats {
  const tasks = byTask(runs);
  const fin = runs.filter((r) => r.outcome === 'finished');
  const finTasks = byTask(fin);
  const time = median([...finTasks.values()].map((l) => median(l.map((r) => r.elapsed_s))));
  const timeAll = median([...tasks.values()].map((l) => median(l.map((r) => r.elapsed_s))));
  const tps = fin.map((r) => r.tps).filter((v): v is number => typeof v === 'number' && v > 0);
  return {
    runs: runs.length,
    finished: fin.length,
    timedOut: runs.filter((r) => r.outcome === 'timed_out').length,
    errors: runs.filter((r) => r.outcome !== 'finished' && r.outcome !== 'timed_out').length,
    time,
    timeAll,
    tps: { median: median(tps), n: tps.length },
    cost: mean([...tasks.values()].map((l) => mean(l.map((r) => r.cost)))),
  };
}

/** Runs by `<setup>|<task>`. */
export type RunsByCell = Map<string, SlimRun[]>;

export function indexRuns(runs: readonly SlimRun[]): RunsByCell {
  const m: RunsByCell = new Map();
  for (const r of runs) {
    const k = `${r.setup}|${r.task}`;
    const l = m.get(k);
    if (l) l.push(r);
    else m.set(k, [r]);
  }
  return m;
}

export const cellKey = (setup: string, task: string) => `${setup}|${task}`;

/** The run a cell's score link opens: the newest counted run, scored ones first (as `cell-runs.json`). */
export function scoredRunOf(
  list: readonly SlimRun[] | undefined,
  states: ReadonlySet<string>,
): SlimRun | null {
  const cand = (list ?? []).filter((r) => states.has(r.state));
  if (!cand.length) return null;
  const rank = (r: SlimRun) => (r.state === 'counted' ? 0 : 1);
  return cand
    .slice()
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(b.score !== null) - Number(a.score !== null) ||
        (b.started_at ?? '').localeCompare(a.started_at ?? '') ||
        b.run_uuid.localeCompare(a.run_uuid),
    )[0]!;
}
