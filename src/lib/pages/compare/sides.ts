// Gathering what the numbers need for each chosen side, and the page's URL codec. Pure except `loadTaskRuns`.

import { base } from '$app/paths';
import { cellsOf, type Candidate, type View } from '$lib/core/scoring';
import type { CatalogTask, Setup, SuiteIndex } from '$lib/core/types';
import type { CountedBlock, NumSide, NumTask, RunInfo } from './numbers';
import { runOutcome, type PairRun, type PairSide } from './pairing';
import { identityOf, unrecordedDeployment } from './resolve';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ---- URL (B-01) ----

export interface CompareQuery {
  s: string[];
  mode: string | null;
  suite: string | null;
}

/** `?s=a,b&mode=chat&suite=v3`. Values are URI-encoded, comma-joined. Never throws. */
export function parseCompareQuery(search: string): CompareQuery {
  const q = new URLSearchParams(search.startsWith('?') ? search : '?' + search);
  // URLSearchParams would turn `+` in a Combined side's id into a space: read it raw instead
  const raw = (key: string): string | null => {
    for (const part of search.replace(/^\?/, '').split('&')) {
      const eq = part.indexOf('=');
      if ((eq < 0 ? part : part.slice(0, eq)) === key) return eq < 0 ? '' : part.slice(eq + 1);
    }
    return null;
  };
  const dec = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  const sRaw = raw('s');
  return {
    s: sRaw ? sRaw.split(',').map(dec).filter(Boolean) : [],
    mode: q.get('mode') || null,
    suite: q.get('suite') || null,
  };
}

// ---- Cells and runs ----

export function taskOf(t: CatalogTask): NumTask {
  return { id: t.id, name: t.name || t.id, tier: t.tier };
}

/** The section's active tasks, in display order. */
export function activeTasks(view: View): NumTask[] {
  return view.tasks.filter((t) => t.status === 'active').map(taskOf);
}

function members(c: Candidate): Setup[] {
  return c.members.filter((m): m is Setup => !!m);
}

/** A side's counted blocks by task. A Combined side's members cover different sections, so tasks don't overlap. */
export function countedOf(index: SuiteIndex, c: Candidate): Map<string, CountedBlock> {
  const out = new Map<string, CountedBlock>();
  for (const m of members(c)) {
    for (const [task, cell] of cellsOf(index, m.id)) {
      const b = cell.counted;
      if (!b || !(b.n > 0)) continue;
      if (!out.has(task)) out.set(task, b);
    }
  }
  return out;
}

interface SlimRun {
  run_uuid?: string;
  setup?: string;
  state?: string;
  score?: unknown;
  outcome?: unknown;
  elapsed_s?: unknown;
  tps?: unknown;
  cost?: unknown;
  started_at?: string | null;
}

/** `<suite>/tasks/<task>.json`'s slim runs, or [] on any failure (the page then just lacks time and cost). */
export async function loadTaskRuns(fetchFn: typeof fetch, suite: string, task: string): Promise<SlimRun[]> {
  const res = await fetchFn(
    `${base}/data/${encodeURIComponent(suite)}/tasks/${encodeURIComponent(task)}.json`,
  );
  if (!res.ok) throw new Error(`${task}: ${res.status} ${res.statusText}`);
  const j = (await res.json()) as { runs?: SlimRun[] };
  return Array.isArray(j?.runs) ? j.runs : [];
}

/** Each side's counted runs by task, from the tasks' slim runs. */
export function runsBySide(
  items: readonly Candidate[],
  tasks: ReadonlyMap<string, readonly SlimRun[]>,
): Map<string, RunInfo[]>[] {
  return items.map((c) => {
    const ids = new Set<string>(members(c).map((m) => m.id));
    const out = new Map<string, RunInfo[]>();
    for (const [task, runs] of tasks) {
      const list: RunInfo[] = [];
      for (const r of runs) {
        if (r?.state !== 'counted' || !r.setup || !ids.has(r.setup) || !r.run_uuid) continue;
        list.push({
          uuid: r.run_uuid,
          startedAt: r.started_at ?? null,
          outcome: runOutcome({ outcome: r.outcome }),
          score: num(r.score),
          elapsed: num(r.elapsed_s),
          tps: num(r.tps),
          cost: num(r.cost),
        });
      }
      if (list.length) out.set(task, list);
    }
    return out;
  });
}

export function numSides(
  index: SuiteIndex,
  items: readonly Candidate[],
  runs?: readonly ReadonlyMap<string, readonly RunInfo[]>[],
): NumSide[] {
  return items.map((c, i) => ({ counted: countedOf(index, c), runs: runs?.[i] }));
}

/**
 * A side as the pairing rules see it. Before the tasks' runs are loaded the counted blocks stand in: a
 * block with k finished runs and some that did not is that many finished runs at the mean and that many
 * unfinished ones, which gives the same shared tasks and scores.
 */
export function pairSide(
  c: Candidate,
  counted: ReadonlyMap<string, CountedBlock>,
  runs: ReadonlyMap<string, readonly RunInfo[]> | undefined,
): PairSide {
  const first = c.first;
  const mapped = new Map<string, PairRun[]>();
  if (runs) {
    for (const [task, list] of runs)
      mapped.set(
        task,
        list.map((r) => ({ outcome: r.outcome, score: r.score, elapsed: r.elapsed, cost: r.cost })),
      );
  } else {
    const none = { elapsed: null, cost: null };
    for (const [task, b] of counted) {
      const list: PairRun[] = [];
      for (let i = 0; i < b.n_finished; i++)
        list.push({ outcome: 'finished', score: b.mean_finished, ...none });
      for (let i = 0; i < b.timeouts; i++) list.push({ outcome: 'timed_out', score: null, ...none });
      for (let i = 0; i < b.errors; i++) list.push({ outcome: 'error', score: null, ...none });
      if (!list.length) list.push({ outcome: 'finished', score: null, ...none });
      mapped.set(task, list);
    }
  }
  return {
    identity: identityOf(c),
    deployment: first.deployment || null,
    recorded: !unrecordedDeployment(first),
    costKind: first.where === 'local' ? 'electricity' : first.where === 'cloud' ? 'billed' : null,
    runs: mapped,
  };
}

const taskRunCache = new Map<string, Promise<SlimRun[]>>();
/** `loadTaskRuns` once per suite and task; a failure is not cached, so Try again refetches. */
export function taskRuns(fetchFn: typeof fetch, suite: string, task: string): Promise<SlimRun[]> {
  const key = `${suite}/${task}`;
  let p = taskRunCache.get(key);
  if (!p) {
    p = loadTaskRuns(fetchFn, suite, task);
    p.catch(() => taskRunCache.delete(key));
    taskRunCache.set(key, p);
  }
  return p;
}
