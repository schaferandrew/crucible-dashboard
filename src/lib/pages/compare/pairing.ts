// Paired comparison rules (behaviour-spec 2.4, PAIR-01..09). Pure functions over plain inputs: no DOM, no
// Svelte, no site-data types, so the rules are tested on their own and the model page's A/B block can use
// them too. Differences are `b - a`. Nothing here throws on odd data: a missing number is just null.

/** Rule 5 (PAIR-05): a "scores X higher/lower" headline needs at least this many paired tasks. */
export const MIN_PAIRED_TASKS = 5;
/** Rule 5: and no single task may account for more than this share of the summed difference. */
export const MAX_TASK_SHARE = 0.5;
/** PAIR-04: a mean or per-task difference below this is "the same"; at or above it a task "differs". */
export const SAME_BELOW = 0.05;
/** CMP-RESOLVE-01: the most setups a comparison holds. */
export const MAX_COMPARE = 4;
/** Two scores closer than this are tied (CMP-DIFF-03). */
export const TIE = 1e-9;

// ---- Outcomes (PAIR-02, PAIR-03) ----

export type Outcome = 'finished' | 'timed_out' | 'error';

interface OutcomeSource {
  /** Slim runs carry the class itself (`finished`, `timed_out`, `error`); records carry `{timed_out, status}`. */
  outcome?: unknown;
  status?: unknown;
}

function statusOf(r: OutcomeSource | null | undefined): { timedOut: boolean; status: string | null } {
  const o = r?.outcome;
  if (o && typeof o === 'object') {
    const rec = o as { timed_out?: unknown; status?: unknown };
    const status =
      typeof rec.status === 'string' ? rec.status : typeof r?.status === 'string' ? r.status : null;
    return { timedOut: rec.timed_out === true || status === 'timeout', status };
  }
  const s = typeof o === 'string' ? o : typeof r?.status === 'string' ? r.status : null;
  return { timedOut: s === 'timeout' || s === 'timed_out', status: s };
}

/** `timed_out` (timed out, or status `timeout`), `finished` (status `completed`), else `error`. */
export function runOutcome(r: OutcomeSource | null | undefined): Outcome {
  const { timedOut, status } = statusOf(r);
  if (timedOut) return 'timed_out';
  return status === 'completed' || status === 'finished' ? 'finished' : 'error';
}

/** finished / timed out / harness error; any other error status is the status with underscores as spaces. */
export function outcomeText(r: OutcomeSource | null | undefined): string {
  const o = runOutcome(r);
  if (o === 'finished') return 'finished';
  if (o === 'timed_out') return 'timed out';
  const { status } = statusOf(r);
  if (!status || status === 'error' || status === 'harness_error') return 'harness error';
  return status.replace(/_/g, ' ');
}

// ---- Small statistics ----

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function mean(values: readonly (number | null | undefined)[]): number | null {
  const v = values.filter(isNum);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

export function median(values: readonly (number | null | undefined)[]): number | null {
  const v = values.filter(isNum).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

// ---- Which setting differs (IDENT-VAR-04, PAIR-07, CMP-CTRL-06) ----

export type VariantDim = 'model' | 'weights' | 'reasoning' | 'harness';

/** What changes the answer. Compare one of these per side. */
export interface Identity {
  model: string;
  /** What the weights are: packager, format and quant of a local setup, `api` for cloud (not the model). */
  weights: string;
  reasoning: string;
  /** A Combined side with several harnesses joins them in section order. */
  harness: string;
}

/** The answer-changing dimensions on which two sides differ (the model, its weights, reasoning, harness). */
export function variantDiff(a: Identity, b: Identity): VariantDim[] {
  const out: VariantDim[] = [];
  if (a.model !== b.model) out.push('model');
  if (a.weights !== b.weights) out.push('weights');
  if (a.reasoning !== b.reasoning) out.push('reasoning');
  if (a.harness !== b.harness) out.push('harness');
  return out;
}

/** A section's variant dimensions: harness only counts where the section has more than one (IDENT-VAR-03). */
export function variantDims(harnessCount: number): VariantDim[] {
  return harnessCount > 1 ? ['model', 'weights', 'reasoning', 'harness'] : ['model', 'weights', 'reasoning'];
}

/** How a dimension is worded in a note (the weights differ in their quant, packager or format). */
const DIM_LABEL: Record<VariantDim, string> = {
  model: 'model',
  weights: 'quant',
  reasoning: 'reasoning',
  harness: 'harness',
};

function and(items: string[]): string {
  return items.length > 2 ? items.slice(0, -1).join(', ') + ' and ' + items.at(-1) : items.join(' and ');
}

/** "These differ in X and Y: a difference can't be put down to either." (two sides) or "…to any one of them." */
export function differenceNote(dims: readonly VariantDim[], several = false): string {
  return dims.length > 1
    ? `These differ in ${and(dims.map((d) => DIM_LABEL[d]))}: a difference can't be put down to ${several ? 'any one of them' : 'either'}.`
    : '';
}

// ---- The comparison ----

export interface PairRun {
  outcome: Outcome;
  /** The run's score; only a finished run's score is used. */
  score: number | null;
  elapsed: number | null;
  cost: number | null;
}

export interface PairSide {
  identity: Identity;
  /** The deployment id, null when unknown. */
  deployment: string | null;
  /** The machine or provider was recorded; otherwise speed and cost are never compared (PAIR-08, PAIR-09). */
  recorded: boolean;
  costKind: 'electricity' | 'billed' | null;
  /** The counted runs of each task (by task id). A task with no entry was not run. */
  runs: ReadonlyMap<string, readonly PairRun[]>;
}

export interface PairTask {
  id: string;
  name: string;
}

export interface SideTask {
  runs: number;
  finished: number;
  score: number | null;
  time: number | null;
  cost: number | null;
}

export interface TaskPair {
  task: PairTask;
  /** Both sides have a finished, scored run: the task enters the score difference. */
  counted: boolean;
  a: SideTask;
  b: SideTask;
  diff: number | null;
}

export interface Headline {
  /** Rule 5 lets the sentence say "scores X higher/lower". */
  allowed: boolean;
  reason: 'few-tasks' | 'one-task' | null;
  /** Paired tasks. */
  n: number;
  /** Paired tasks that differ by at least SAME_BELOW. */
  k: number;
  meanDiff: number | null;
  same: boolean;
  /** The task that accounts for most of the difference, when that is why the headline is not allowed. */
  driver: PairTask | null;
}

export interface Speed {
  comparable: boolean;
  kind: 'deployments' | 'variants' | null;
  /** Both are wall-clock, but local and cloud never share one unlabelled axis. */
  sameKind: boolean;
  a: number | null;
  b: number | null;
  /** Median of the per-task time ratios (b / a), not the ratio of the medians. */
  ratio: number | null;
  /** Tasks with both times. */
  n: number;
  faster: number;
  slower: number;
  reason: string | null;
}

export interface Paired {
  differs: VariantDim[];
  sameVariant: boolean;
  sameDeployment: boolean;
  /** PAIR-07: one answer-changing setting apart, in the section's dims, on the same recorded deployment. */
  ab: boolean;
  note: string;
  shared: PairTask[];
  pairs: TaskPair[];
  paired: TaskPair[];
  meanDiff: number | null;
  headline: Headline;
  speed: Speed;
  cost: {
    a: { kind: string | null; value: number | null };
    b: { kind: string | null; value: number | null };
    /** Cost is comparable only when speed is and the kinds match. */
    comparable: boolean;
  };
}

function sideTask(runs: readonly PairRun[]): SideTask {
  const fin = runs.filter((r) => r.outcome === 'finished' && isNum(r.score));
  return {
    runs: runs.length,
    finished: fin.length,
    score: fin.length ? mean(fin.map((r) => r.score)) : null,
    time: median(fin.map((r) => r.elapsed)),
    cost: mean(runs.map((r) => r.cost)),
  };
}

/**
 * Compare two sides on the tasks both ran (PAIR-01). `tasks` are the section's active tasks, in display
 * order; `dims` the section's variant dimensions.
 */
export function pairedComparison(
  a: PairSide,
  b: PairSide,
  tasks: readonly PairTask[],
  dims: readonly VariantDim[],
): Paired {
  const differs = variantDiff(a.identity, b.identity);
  const sameVariant = differs.length === 0;
  const bothRecorded = a.recorded && b.recorded && a.deployment !== null && b.deployment !== null;
  const sameDeployment = bothRecorded && a.deployment === b.deployment;

  const shared: PairTask[] = [];
  const pairs: TaskPair[] = [];
  for (const task of tasks) {
    const ra = a.runs.get(task.id);
    const rb = b.runs.get(task.id);
    if (!ra?.length || !rb?.length) continue;
    shared.push(task);
    const pa = sideTask(ra);
    const pb = sideTask(rb);
    const counted = pa.score !== null && pb.score !== null;
    pairs.push({ task, a: pa, b: pb, counted, diff: counted ? pb.score! - pa.score! : null });
  }
  const paired = pairs.filter((p) => p.counted);
  const n = paired.length;
  const total = paired.reduce((s, p) => s + p.diff!, 0);
  const meanDiff = n ? total / n : null;
  const differing = paired.filter((p) => Math.abs(p.diff!) >= SAME_BELOW);
  const driverPair = [...paired].sort((x, y) => Math.abs(y.diff!) - Math.abs(x.diff!))[0] ?? null;
  const same = n > 0 && Math.abs(meanDiff!) < SAME_BELOW;
  let reason: Headline['reason'] = null;
  if (n < MIN_PAIRED_TASKS) reason = 'few-tasks';
  else if (!same && Math.abs(driverPair!.diff!) > MAX_TASK_SHARE * Math.abs(total)) reason = 'one-task';
  const headline: Headline = {
    allowed: !reason,
    reason,
    n,
    k: differing.length,
    meanDiff,
    same,
    driver: reason === 'one-task' ? driverPair!.task : null,
  };

  // PAIR-08: speed and cost only on one recorded deployment (two variants there), or between two recorded
  // deployments of one variant; never with an unrecorded one
  const kind: Speed['kind'] = !bothRecorded
    ? null
    : sameVariant && !sameDeployment
      ? 'deployments'
      : sameDeployment
        ? 'variants'
        : null;
  const ratios = paired.map((p) => (p.a.time && p.b.time ? p.b.time / p.a.time : null));
  const timed = ratios.filter(isNum);
  const speed: Speed = {
    comparable: kind !== null,
    kind,
    sameKind: bothRecorded && a.costKind === b.costKind,
    a: median(paired.map((p) => p.a.time)),
    b: median(paired.map((p) => p.b.time)),
    ratio: median(ratios),
    n: timed.length,
    faster: timed.filter((r) => r < 1).length,
    slower: timed.filter((r) => r > 1).length,
    reason:
      kind !== null
        ? null
        : !bothRecorded
          ? "A machine or provider wasn't recorded."
          : "Different variants on different deployments: a time difference can't be put down to either.",
  };

  return {
    differs,
    sameVariant,
    sameDeployment,
    ab: differs.length === 1 && dims.includes(differs[0]!) && sameDeployment,
    note: differs.length > 1 ? differenceNote(differs) : '',
    shared,
    pairs,
    paired,
    meanDiff,
    headline,
    speed,
    cost: {
      a: { kind: a.costKind, value: mean(paired.map((p) => p.a.cost)) },
      b: { kind: b.costKind, value: mean(paired.map((p) => p.b.cost)) },
      comparable: kind !== null && a.costKind !== null && a.costKind === b.costKind,
    },
  };
}

/**
 * The summary sentence (PAIR-05, PAIR-06). `b` is the subject. A "higher/lower" headline only when rule 5
 * allows it, else "differ on k of n".
 */
export function pairSentence(p: Paired, nameA: string, nameB: string): string {
  const n = p.headline.n;
  if (!n)
    return p.shared.length
      ? `No task both finished, of the ${p.shared.length} both ran.`
      : 'No task in common.';
  const on = ` on ${n} shared finished task${n === 1 ? '' : 's'}`;
  if (p.headline.allowed) {
    return p.headline.same
      ? `${nameB} scores the same as ${nameA}${on}.`
      : `${nameB} scores ${Math.abs(p.headline.meanDiff!).toFixed(1)}${p.headline.meanDiff! > 0 ? ' higher' : ' lower'} than ${nameA} on average${on}.`;
  }
  return (
    `${nameA} and ${nameB} differ on ${p.headline.k} of ${n} shared finished task${n === 1 ? '' : 's'}` +
    (p.headline.driver ? ` (${p.headline.driver.name} accounts for most of the difference)` : '') +
    '.'
  );
}
