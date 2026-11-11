// The scoring core: task weights, tier scores, gates, Overall, row statistics, the best setup of each row,
// ranking and the Combined pairing. Pure functions over a loaded `SuiteIndex`; no DOM, no Svelte.
//
// This is a port of the page's old crucible-core.js (V.taskWeights, tierScoreBy, gateVerdict, V.aggregate,
// V.stats, V.rows, S.betterConfig, V.isRanked, buildCombinedView), reading cells and `setup_stats` from
// site-data instead of raw runs. Every number a row shows belongs to one setup (or, in Combined, one
// pair of setups), never stitched per task.

import { meets, suiteInfo, type SuiteInfo } from './catalog';
import type {
  Block,
  Cell,
  CatalogMode,
  CatalogTask,
  CatalogTier,
  RunTriple,
  Setup,
  SetupId,
  SuiteIndex,
  Stats,
  TaskId,
  TierId,
  TierResult,
  Verdict,
} from './types';
import { COMBINED } from './types';

/** Sort key for the Overall column. Other keys are tier ids, 'model', 'time', 'tps' and 'cost'. */
export const OVERALL = 'overall';

export interface SortSpec {
  key: string;
  /** 1 ascending, -1 descending */
  dir: 1 | -1;
}

export interface Progress {
  done: number;
  total: number;
  share: number;
}

/** One leaderboard candidate: a setup, or in Combined one setup per section that match except for the harness. */
export interface Candidate {
  id: string;
  /** One entry per section of the view (a section view has one); null where the section has no setup. */
  members: (Setup | null)[];
  /** The first present member: the candidate's identity (model, quant, hardware, ...) for filters and labels. */
  first: Setup;
  model: string;
  reasoning: string;
  rowKey: string;
}

/** Everything the leaderboard shows for one candidate. */
export interface RowStats {
  candidate: Candidate;
  setup: Setup;
  local: boolean;
  ran: boolean;
  tier: Record<string, TierResult | null>;
  verdict: Record<string, Verdict>;
  overall: TierResult;
  progress: Progress;
  inProgress: boolean;
  /** Counted (scored) runs behind the numbers. */
  runs: number;
  time: number | null;
  tps: number | null;
  /** How many runs recorded a decode speed. */
  tpsRuns: number;
  cost: number | null;
  /** Provisional tasks run / folded in (provisional preview only). */
  provisionalRan: { done: number; total: number } | null;
  /**
   * True when time, tok/s or cost pool two setups' runs (Combined) and were estimated from each setup's
   * median, because the site data has no per-run values to pool. See the Phase 3 report.
   */
  approx: boolean;
  /** The per-setup statistics behind time, tok/s and cost (one per present member; empty when none). */
  memberStats: Stats[];
}

/** A leaderboard row: one model at one reasoning level, shown by its best candidate. */
export interface Row extends RowStats {
  rowKey: string;
  label: string;
  model: string;
  reasoning: string;
  /** Every candidate of the row, best first. */
  variants: RowStats[];
}

export interface SectionScores {
  setup: Setup;
  ran: boolean;
  /** Every suite tier's result (tiers the section has no task in come out unscored). */
  allTier: Record<string, TierResult>;
  verdict: Record<string, Verdict>;
  progress: Progress;
  runs: number;
  provisionalRan: { done: number; total: number } | null;
}

export interface View {
  kind: 'section' | 'combined';
  id: string;
  label: string;
  info: SuiteInfo;
  provisional: boolean;
  /** The tier columns of this view. */
  tiers: CatalogTier[];
  /** Overall is shown when there is more than one tier (or, in Combined, more than one section). */
  showAgg: boolean;
  /** The shown tasks: this view's active tasks, tier by tier, area order within a tier (provisional ones too when folded in). */
  tasks: CatalogTask[];
  taskIds: Set<TaskId>;
  provisionalTasks: CatalogTask[];
  /** Active tasks in this view. */
  activeCount: number;
  /** The harnesses of the section's catalog entry (empty for Combined). */
  harnesses: string[];
  /** The sections of this view (one for a section, all for Combined). */
  parts: SectionView[];
  aggTiers(exclude?: ReadonlySet<TierId>): CatalogTier[];
  aggMax(exclude?: ReadonlySet<TierId>): number;
  tierMax(tier: string): number;
  candidates(): Candidate[];
  stats(c: Candidate, exclude?: ReadonlySet<TierId>): RowStats;
}

export interface SectionView extends View {
  kind: 'section';
  mode: CatalogMode;
  weights(tier: string): Map<TaskId, number>;
  scores(setup: Setup): SectionScores;
  tierScore(setup: Setup, tier: string, only?: ReadonlySet<TaskId>): TierResult;
  isProvisional(task: string): boolean;
}

// ---- Caches ----

interface IndexCache {
  info: SuiteInfo;
  cells: Map<string, Map<string, Cell>>;
  setups: Setup[];
  views: Map<string, View>;
}

const caches = new WeakMap<SuiteIndex, IndexCache>();

function cacheOf(index: SuiteIndex): IndexCache {
  let c = caches.get(index);
  if (!c) {
    const cells = new Map<string, Map<string, Cell>>();
    for (const cell of index.cells) {
      let m = cells.get(cell.setup);
      if (!m) cells.set(cell.setup, (m = new Map()));
      m.set(cell.task, cell);
    }
    c = {
      info: suiteInfo(index.catalog),
      cells,
      setups: Object.values(index.entities.setups),
      views: new Map(),
    };
    caches.set(index, c);
  }
  return c;
}

/** The cells of a setup, by task id (empty when none). */
export function cellsOf(index: SuiteIndex, setup: SetupId | string): Map<string, Cell> {
  return cacheOf(index).cells.get(setup) ?? new Map();
}

export function allSetups(index: SuiteIndex): Setup[] {
  return cacheOf(index).setups;
}

// ---- Small helpers ----

function mean(values: (number | null | undefined)[]): number | null {
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

function median(values: (number | null | undefined)[]): number | null {
  const v = values
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    .sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

function blockMean(b: Block | undefined): number | null {
  return b && typeof b.mean === 'number' ? b.mean : null;
}

function addProv(into: TierResult, list: (TierResult | null)[]): void {
  const withProv = list.filter((r): r is TierResult => !!r && !!r.prov);
  if (withProv.length) {
    into.prov = {
      scored: withProv.reduce((n, r) => n + r.prov!.scored, 0),
      total: withProv.reduce((n, r) => n + r.prov!.total, 0),
    };
  }
}

export function gateVerdict(result: TierResult | null, gate: { mean: number; min: number }): Verdict {
  if (!result || result.score === null) return null;
  if (result.partial) return 'partial';
  return result.score >= gate.mean && (result.min ?? 0) >= gate.min ? 'pass' : 'fail';
}

const key = (ex: ReadonlySet<TierId> | undefined) => (ex ? [...ex].sort().join(',') : '');

// ---- A section (one mode of the suite) ----

function buildSection(index: SuiteIndex, modeId: string, provisional: boolean): SectionView {
  const ic = cacheOf(index);
  const info = ic.info;
  const mode: CatalogMode = info.mode(modeId) ?? {
    id: modeId as CatalogMode['id'],
    label: '',
    blurb: '',
    order: 0,
    areas: [],
    harnesses: [],
  };

  const inMode = (t: CatalogTask) =>
    t.mode === modeId && (t.status === 'active' || (provisional && t.status === 'provisional'));
  const isProv = (t: CatalogTask) => t.status === 'provisional';
  const provisionalTasks = provisional ? info.tasks.filter((t) => t.mode === modeId && isProv(t)) : [];
  const provIds = new Set<TaskId>(provisionalTasks.map((t) => t.id));
  const activeCount = info.tasks.filter((t) => t.mode === modeId && t.status === 'active').length;

  const areaOrder = mode.areas.length
    ? mode.areas
    : info.catalog.areas.filter((a) => a.mode === modeId).map((a) => a.id);
  const tierIds = info.tiers
    .map((t) => t.id)
    .filter((tier) => info.tasks.some((t) => inMode(t) && t.tier === tier));
  const tasks: CatalogTask[] = [];
  for (const tier of tierIds) {
    const inTier = info.tasks.filter((t) => inMode(t) && t.tier === tier);
    const placed = new Set<TaskId>();
    for (const area of areaOrder) {
      for (const t of inTier)
        if (t.area === area) {
          tasks.push(t);
          placed.add(t.id);
        }
    }
    for (const t of inTier) if (!placed.has(t.id)) tasks.push(t); // an area the section doesn't list
  }
  const taskIds = new Set<TaskId>(tasks.map((t) => t.id));
  const tiers = info.tiers.filter((t) => tierIds.includes(t.id));
  if (!tiers.length) tiers.push(info.headline);

  // Each active task's share of its tier: the catalog's weight, else its category's weight split
  const weightCache = new Map<string, Map<TaskId, number>>();
  function weights(tier: string): Map<TaskId, number> {
    const hit = weightCache.get(tier);
    if (hit) return hit;
    const active = info.tasks.filter((t) => inMode(t) && t.tier === tier && t.status === 'active');
    const perCategory = new Map<string, number>();
    for (const t of active) perCategory.set(t.category ?? '', (perCategory.get(t.category ?? '') ?? 0) + 1);
    const w = new Map<TaskId, number>();
    let sum = 0;
    for (const t of active) {
      const v =
        typeof t.weight === 'number'
          ? t.weight
          : (info.categoryWeights.get(t.category ?? '') ?? 0) / perCategory.get(t.category ?? '')!;
      w.set(t.id, v);
      sum += v;
    }
    // A tier nothing weights yet counts its tasks equally rather than vanishing
    if (!sum && active.length) for (const t of active) w.set(t.id, 1 / active.length);
    // A provisional task folded in weighs what the catalog says, else what an active task of its
    // category in this tier weighs on average, else the tier's average active task (1 with none)
    if (provisional) {
      const avg = (list: CatalogTask[]) =>
        list.length ? list.reduce((n, t) => n + w.get(t.id)!, 0) / list.length : null;
      const tierAvg = avg(active);
      for (const t of info.tasks) {
        if (!inMode(t) || t.tier !== tier || !isProv(t)) continue;
        const same = avg(active.filter((x) => x.category === t.category));
        w.set(
          t.id,
          typeof t.weight === 'number' ? t.weight : same !== null ? same : tierAvg !== null ? tierAvg : 1,
        );
      }
    }
    weightCache.set(tier, w);
    return w;
  }

  /** A setup's score on a task here: its counted runs' mean, or for a provisional task folded in, its provisional runs' mean. */
  function meanOf(setup: Setup, task: TaskId): number | null {
    const cell = ic.cells.get(setup.id)?.get(task);
    if (!cell) return null;
    return provIds.has(task) ? blockMean(cell.provisional) : blockMean(cell.counted);
  }

  /**
   * Tier score: weighted mean of per-task means, rescaled over the scored tasks. Coverage is the share of
   * the tier's weight that was scored; below `coverage_min` the score is partial. `only` limits it to a
   * set of tasks (the compare view's shared tasks).
   */
  function tierScoreBy(
    meanFor: (task: TaskId) => number | null,
    tier: string,
    only?: ReadonlySet<TaskId>,
  ): TierResult {
    const w = weights(tier);
    let total = 0,
      scoredWeight = 0,
      allWeight = 0,
      coveredWeight = 0,
      n = 0,
      nScored = 0,
      provN = 0,
      provScored = 0;
    const scores: number[] = [];
    for (const [id, weight] of w) {
      if (only && !only.has(id)) continue;
      const prov = provIds.has(id);
      if (prov) provN += 1;
      else {
        allWeight += weight;
        n += 1;
      }
      const score = meanFor(id);
      if (score === null) continue;
      scores.push(score);
      total += score * weight;
      scoredWeight += weight;
      if (prov) provScored += 1;
      else {
        coveredWeight += weight;
        nScored += 1;
      }
    }
    const result: TierResult = {
      score: scoredWeight ? total / scoredWeight : null,
      max: 10,
      coverage: allWeight ? coveredWeight / allWeight : 0,
      scored: nScored,
      total: n,
      min: scores.length ? Math.min(...scores) : null,
      partial: false,
    };
    if (provN) result.prov = { scored: provScored, total: provN };
    result.partial = result.score !== null && !meets(result.coverage, info.coverageMin);
    return result;
  }

  const scoresCache = new Map<string, SectionScores>();
  function scores(setup: Setup): SectionScores {
    const hit = scoresCache.get(setup.id);
    if (hit) return hit;
    const cells = ic.cells.get(setup.id);
    const allTier: Record<string, TierResult> = {};
    const verdict: Record<string, Verdict> = {};
    for (const t of info.tiers) {
      const r = (allTier[t.id] = tierScoreBy((id) => meanOf(setup, id), t.id));
      const gate = info.gateOf(t.id);
      if (gate) verdict[t.id] = gateVerdict(r, gate);
    }
    let runs = 0;
    let ran = false;
    let done = 0;
    if (cells) {
      for (const [taskId, cell] of cells) {
        if (!taskIds.has(taskId as TaskId)) continue;
        ran = true;
        runs += (provIds.has(taskId as TaskId) ? cell.provisional : cell.counted)?.n_scored ?? 0;
      }
    }
    for (const t of tasks) if (t.status === 'active' && meanOf(setup, t.id) !== null) done += 1;
    const progress: Progress = { done, total: activeCount, share: activeCount ? done / activeCount : 0 };
    const provisionalRan = provisional
      ? {
          done: provisionalTasks.filter((t) => meanOf(setup, t.id) !== null).length,
          total: provisionalTasks.length,
        }
      : null;
    const out: SectionScores = { setup, ran, allTier, verdict, progress, runs, provisionalRan };
    scoresCache.set(setup.id, out);
    return out;
  }

  const aggTiers = (exclude?: ReadonlySet<TierId>) => {
    const on = tiers.filter((t) => !exclude?.has(t.id));
    return on.length ? on : tiers;
  };
  const aggMax = (exclude?: ReadonlySet<TierId>) => aggTiers(exclude).length * 10;

  /** Overall: the chosen tiers' 0-10 scores added up. Partial when any of them is partial or unscored. */
  function aggregate(
    tierResults: Record<string, TierResult | undefined>,
    exclude?: ReadonlySet<TierId>,
  ): TierResult {
    const list = aggTiers(exclude).map((t) => tierResults[t.id] ?? null);
    const scored = list.filter((r): r is TierResult => !!r && r.score !== null);
    const mins = scored.map((r) => r.min).filter((v): v is number => v !== null);
    const result: TierResult = {
      score: scored.length ? scored.reduce((n, r) => n + r.score!, 0) : null,
      max: aggMax(exclude),
      coverage: mean(list.map((r) => (r ? r.coverage : 0))) || 0,
      scored: list.reduce((n, r) => n + (r ? r.scored : 0), 0),
      total: list.reduce((n, r) => n + (r ? r.total : 0), 0),
      min: mins.length ? Math.min(...mins) : null,
      partial: false,
    };
    result.partial = result.score !== null && list.some((r) => !r || r.score === null || r.partial);
    addProv(result, list);
    return result;
  }

  let cands: Candidate[] | null = null;
  const candidates = () =>
    (cands ??= ic.setups
      .filter(
        (s) =>
          ic.cells.get(s.id) &&
          [...ic.cells.get(s.id)!.keys()].some((t) => info.taskById.get(t as TaskId)?.mode === modeId),
      )
      .map(candidateOf));

  const statsCache = new Map<string, RowStats>();
  const view: SectionView = {
    kind: 'section',
    id: modeId,
    label: mode.label || modeId,
    info,
    provisional,
    tiers,
    showAgg: tiers.length > 1,
    tasks,
    taskIds,
    provisionalTasks,
    activeCount,
    harnesses: mode.harnesses.slice(),
    parts: [],
    mode,
    aggTiers,
    aggMax,
    tierMax: () => 10,
    weights,
    scores,
    tierScore: (setup, tier, only) => tierScoreBy((id) => meanOf(setup, id), tier, only),
    isProvisional: (id) => provIds.has(id as TaskId),
    candidates,
    stats(c, exclude) {
      const ck = c.id + '#' + (view.aggTiers(exclude).length === tiers.length ? '' : key(exclude));
      const hit = statsCache.get(ck);
      if (hit) return hit;
      const setup = c.first;
      const sc = scores(setup);
      const tier: Record<string, TierResult | null> = {};
      for (const t of info.tiers) {
        const r = sc.allTier[t.id]!;
        // a stretch tier nothing in this section weights has no column
        tier[t.id] = t.id === info.headline.id || info.gateOf(t.id) || r.total || r.prov ? r : null;
      }
      const pooled = lookupStats(
        index,
        setup.id,
        view.aggTiers(exclude).map((t) => t.id),
        provisional,
      );
      const out: RowStats = {
        candidate: c,
        setup,
        local: setup.where === 'local',
        ran: sc.ran,
        tier,
        verdict: sc.verdict,
        overall: aggregate(sc.allTier, exclude),
        progress: sc.progress,
        inProgress: !meets(sc.progress.share, info.inProgressBelow),
        runs: sc.runs,
        time: pooled?.time ?? null,
        tps: pooled?.tps.median ?? null,
        tpsRuns: pooled?.tps.n ?? 0,
        cost: pooled?.cost ?? null,
        provisionalRan: sc.provisionalRan,
        approx: false,
        memberStats: pooled ? [pooled] : [],
      };
      statsCache.set(ck, out);
      return out;
    },
  };
  view.parts = [view];
  return view;
}

function candidateOf(s: Setup): Candidate {
  return { id: s.id, members: [s], first: s, model: s.model, reasoning: s.reasoning, rowKey: rowKeyOf(s) };
}

/** A row is a model at a reasoning level. The key is only ever compared, never parsed. */
export function rowKeyOf(s: { model: string; reasoning: string }): string {
  return `${s.model}#${s.reasoning}`;
}

// ---- Setup statistics (time, speed, cost) from setup_stats ----

/**
 * Median time, median decode speed and mean cost for a setup over its scored counted runs (and, with
 * `provisional`, its scored provisional runs) in tasks of the given tiers. Uses the contract's included-tier
 * subset key; the `cells` fallback format (suites with more than five tiers) is computed from run triples.
 */
export function lookupStats(
  index: SuiteIndex,
  setup: SetupId,
  tiers: readonly TierId[],
  provisional: boolean,
): Stats | null {
  const ss = index.setup_stats;
  if (!ss) return null;
  if (ss.format === 'subsets') {
    const entry = ss.by_setup?.[setup];
    if (!entry) return null;
    const wanted = new Set(tiers);
    const ids = ss.tiers.filter((t) => wanted.has(t));
    const suffix = provisional ? ':p1' : ':p0';
    const k = ids.join('+') + suffix;
    let pos = ss.keys.indexOf(k);
    if (pos < 0) pos = ss.keys.findIndex((x) => x.endsWith(suffix)); // largest subset
    if (pos < 0) return null;
    const at = entry.index[pos];
    return at !== undefined && at >= 0 ? (entry.stats[at] ?? null) : null;
  }
  if (ss.format === 'cells') {
    const entry = ss.by_setup?.[setup];
    if (!entry) return null;
    const info = cacheOf(index).info;
    const wanted = new Set(tiers);
    const triples: RunTriple[] = [];
    for (const [task, runs] of Object.entries(entry)) {
      const t = info.taskById.get(task as TaskId);
      if (!t || !t.tier || !wanted.has(t.tier)) continue;
      triples.push(...(runs.counted ?? []));
      if (provisional) triples.push(...(runs.provisional ?? []));
    }
    if (!triples.length) return null;
    const tps = triples.map((x) => x[1]).filter((v): v is number => typeof v === 'number' && v > 0);
    return {
      runs: triples.length,
      time: median(triples.map((x) => x[0])),
      cost: mean(triples.map((x) => x[2])),
      tps: { median: median(tps), n: tps.length },
    };
  }
  return null;
}

// ---- Combined ----

function buildCombined(index: SuiteIndex, provisional: boolean): View {
  const ic = cacheOf(index);
  const info = ic.info;
  const parts = info.modes.map((m) => sectionView(index, m.id, provisional));

  const tierIds = info.tiers
    .map((t) => t.id)
    .filter((id) =>
      parts.some((p) => p.tiers.some((t) => t.id === id) && p.tasks.some((x) => x.tier === id)),
    );
  const tiers = info.tiers.filter((t) => tierIds.includes(t.id));
  if (!tiers.length) tiers.push(info.headline);
  const tasks: CatalogTask[] = [];
  const taskIds = new Set<TaskId>();
  for (const p of parts)
    for (const t of p.tasks) {
      tasks.push(t);
      taskIds.add(t.id);
    }
  const partsWith = (tier: string) => parts.filter((p) => p.tasks.some((x) => x.tier === tier));

  // Setups that agree on everything but the harness share a pair key: the same weights (model, packager,
  // format, quant), reasoning level and deployment (where, provider or hardware).
  const pairKey = (s: Setup) => [s.artifact, s.reasoning, s.deployment].join('\u0000');

  /** Every combination of one item (or none, null) per section. */
  function combos<T>(perPart: T[][]): (T | null)[][] {
    let out: (T | null)[][] = [[]];
    for (const list of perPart) {
      const next: (T | null)[][] = [];
      for (const c of out) for (const x of list.length ? list : [null]) next.push([...c, x]);
      out = next;
    }
    return out;
  }

  let cands: Candidate[] | null = null;
  function candidates(): Candidate[] {
    if (cands) return cands;
    const byKey = new Map<string, { part: number; setup: Setup }[]>();
    parts.forEach((p, i) => {
      for (const c of p.candidates()) {
        const k = pairKey(c.first);
        let g = byKey.get(k);
        if (!g) byKey.set(k, (g = []));
        // Several setups of one section can share a key only through different harnesses (agentic's
        // opencode and pi): each is its own pairing
        g.push({ part: i, setup: c.first });
      }
    });
    const out: Candidate[] = [];
    for (const g of byKey.values()) {
      const perPart = parts.map((_, i) => g.filter((x) => x.part === i).map((x) => x.setup));
      for (const members of combos(perPart)) {
        const first = members.find((m): m is Setup => !!m)!;
        out.push({
          id: 'combined:' + members.map((m) => (m ? m.id : '-')).join(','),
          members,
          first,
          model: first.model,
          reasoning: first.reasoning,
          rowKey: rowKeyOf(first),
        });
      }
    }
    return (cands = out);
  }

  const aggTiers = (exclude?: ReadonlySet<TierId>) => {
    const on = tiers.filter((t) => !exclude?.has(t.id));
    return on.length ? on : tiers;
  };
  const tierMax = (tier: string) => partsWith(tier).length * 10;
  const aggMax = (exclude?: ReadonlySet<TierId>) => aggTiers(exclude).reduce((n, t) => n + tierMax(t.id), 0);

  /** A tier's sections added together; sections with no setup leave it partial. */
  function sumTier(tier: string, sections: (SectionScores | null)[]): TierResult {
    const present = partsWith(tier);
    const list = present.map((p) => sections[parts.indexOf(p)]?.allTier[tier] ?? null);
    const scored = list.filter((r): r is TierResult => !!r && r.score !== null);
    const mins = scored.map((r) => r.min).filter((v): v is number => v !== null);
    const result: TierResult = {
      score: scored.length ? scored.reduce((n, r) => n + r.score!, 0) : null,
      max: list.length * 10,
      coverage: mean(list.map((r) => (r ? r.coverage : 0))) || 0,
      scored: list.reduce((n, r) => n + (r ? r.scored : 0), 0),
      total: present.reduce(
        (n, p) => n + [...p.weights(tier).keys()].filter((id) => !p.isProvisional(id)).length,
        0,
      ),
      min: mins.length ? Math.min(...mins) : null,
      partial: false,
    };
    result.partial = result.score !== null && list.some((r) => !r || r.score === null || r.partial);
    addProv(result, list);
    return result;
  }

  const statsCache = new Map<string, RowStats>();
  const view: View = {
    kind: 'combined',
    id: COMBINED,
    label: info.combinedLabel,
    info,
    provisional,
    tiers,
    showAgg: tiers.length > 1 || parts.length > 1,
    tasks,
    taskIds,
    provisionalTasks: parts.flatMap((p) => p.provisionalTasks),
    activeCount: parts.reduce((n, p) => n + p.activeCount, 0),
    harnesses: [],
    parts,
    aggTiers,
    aggMax,
    tierMax,
    candidates,
    stats(c, exclude) {
      const ck = c.id + '#' + (aggTiers(exclude).length === tiers.length ? '' : key(exclude));
      const hit = statsCache.get(ck);
      if (hit) return hit;
      const sections = c.members.map((m, i) => (m ? parts[i]!.scores(m) : null));
      const tier: Record<string, TierResult | null> = {};
      const verdict: Record<string, Verdict> = {};
      for (const t of tiers) {
        tier[t.id] = sumTier(t.id, sections);
        // A gate passes only when every section that has it passes
        if (info.gateOf(t.id)) {
          const vs = partsWith(t.id).map((p) => sections[parts.indexOf(p)]?.verdict[t.id] ?? null);
          verdict[t.id] = vs.some((v) => v === null)
            ? null
            : vs.includes('fail')
              ? 'fail'
              : vs.includes('partial')
                ? 'partial'
                : 'pass';
        }
      }
      const on = aggTiers(exclude).map((t) => tier[t.id]!);
      const scoredOn = on.filter((r) => r.score !== null);
      const mins = scoredOn.map((r) => r.min).filter((v): v is number => v !== null);
      const overall: TierResult = {
        score: scoredOn.length ? scoredOn.reduce((n, r) => n + r.score!, 0) : null,
        max: aggMax(exclude),
        coverage: mean(on.map((r) => r.coverage)) || 0,
        scored: on.reduce((n, r) => n + r.scored, 0),
        total: on.reduce((n, r) => n + r.total, 0),
        min: mins.length ? Math.min(...mins) : null,
        partial: false,
      };
      overall.partial = overall.score !== null && on.some((r) => r.score === null || r.partial);
      addProv(overall, on);

      let done = 0,
        total = 0,
        behind = false,
        provDone = 0,
        provTotal = 0,
        runs = 0;
      parts.forEach((p, i) => {
        const s = sections[i];
        const prog = s ? s.progress : { done: 0, total: p.activeCount, share: 0 };
        provTotal += p.provisionalTasks.length;
        if (s?.provisionalRan) provDone += s.provisionalRan.done;
        done += prog.done;
        total += prog.total;
        runs += s ? s.runs : 0;
        // In progress when any section is short of its share
        if (prog.total && !meets(prog.share, info.inProgressBelow)) behind = true;
      });

      // Time, speed and cost pool the runs of every member. The site data has medians per setup, so a
      // two-setup row is estimated from them (weighted by run count) and flagged `approx`.
      const included = aggTiers(exclude).map((t) => t.id);
      const pooled = c.members.flatMap((m) => {
        const st = m ? lookupStats(index, m.id, included, provisional) : null;
        return st ? [st] : [];
      });
      const approx = pooled.length > 1;
      const wavg = (f: (s: Stats) => number | null, w: (s: Stats) => number): number | null => {
        let num = 0,
          den = 0;
        for (const s of pooled) {
          const v = f(s);
          if (v === null) continue;
          num += v * w(s);
          den += w(s);
        }
        return den ? num / den : null;
      };
      const out: RowStats = {
        candidate: c,
        setup: c.first,
        local: c.first.where === 'local',
        ran: sections.some((s) => s?.ran),
        tier,
        verdict,
        overall,
        progress: { done, total, share: total ? done / total : 0 },
        inProgress: behind,
        runs,
        time: wavg(
          (s) => s.time,
          (s) => s.runs,
        ),
        tps: wavg(
          (s) => s.tps.median,
          (s) => s.tps.n,
        ),
        tpsRuns: pooled.reduce((n, s) => n + s.tps.n, 0),
        cost: wavg(
          (s) => s.cost,
          (s) => s.runs,
        ),
        provisionalRan: provisional ? { done: provDone, total: provTotal } : null,
        approx,
        memberStats: pooled,
      };
      statsCache.set(ck, out);
      return out;
    },
  };
  return view;
}

/** One section's view. `provisional` folds provisional tasks in (the provisional preview). */
export function sectionView(index: SuiteIndex, modeId: string, provisional = false): SectionView {
  const ic = cacheOf(index);
  const k = 's:' + modeId + (provisional ? ':p' : '');
  let v = ic.views.get(k) as SectionView | undefined;
  if (!v) ic.views.set(k, (v = buildSection(index, modeId, provisional)));
  return v;
}

/** The view for a section id: a catalog mode, or Combined when the suite has one. Unknown ids give an empty section. */
export function viewFor(index: SuiteIndex, section: string, provisional = false): View {
  const ic = cacheOf(index);
  if (section === COMBINED && ic.info.hasCombined) {
    const k = 'c' + (provisional ? ':p' : '');
    let v = ic.views.get(k);
    if (!v) ic.views.set(k, (v = buildCombined(index, provisional)));
    return v;
  }
  return sectionView(index, section, provisional);
}

// ---- Best setup, rows, ordering, ranking ----

/**
 * Best setup comparator: among setups whose overall score isn't partial, the highest overall score (ties:
 * more tasks done, then more counted runs); only when none is, the one with the most scored tasks. A
 * near-empty setup never beats a covered one.
 */
export function betterConfig(a: RowStats, b: RowStats): number {
  const ca = a.overall.score !== null && !a.overall.partial;
  const cb = b.overall.score !== null && !b.overall.partial;
  if (ca !== cb) return ca ? -1 : 1;
  if (ca) {
    if (a.overall.score !== b.overall.score) return b.overall.score! - a.overall.score!;
    if (a.progress.done !== b.progress.done) return b.progress.done - a.progress.done;
    return b.runs - a.runs;
  }
  if (a.progress.done !== b.progress.done) return b.progress.done - a.progress.done;
  const sa = a.overall.score === null ? -1 : a.overall.score;
  const sb = b.overall.score === null ? -1 : b.overall.score;
  if (sa !== sb) return sb - sa;
  return b.runs - a.runs;
}

/** A model name with its reasoning level when it is not the default, as the row label reads. */
export function rowLabel(index: SuiteIndex, model: string, reasoning: string): string {
  const m = index.entities.models[model];
  const name = m?.label || model.slice(model.lastIndexOf('/') + 1) || model;
  return name + (reasoning !== 'default' ? ` (reasoning ${reasoning})` : '');
}

/**
 * One row per model and reasoning level, across local and cloud, scored by its best candidate (by the
 * overall score over the tiers `exclude` leaves in). `variants` are its candidates, best first.
 * `keep` filters the candidates considered. A model with no counted run in this view isn't on the board.
 */
export function buildRows(
  index: SuiteIndex,
  view: View,
  keep?: (c: Candidate) => boolean,
  exclude?: ReadonlySet<TierId>,
): Row[] {
  const groups = new Map<string, RowStats[]>();
  for (const c of view.candidates()) {
    if (keep && !keep(c)) continue;
    const list = groups.get(c.rowKey);
    const st = view.stats(c, exclude);
    if (list) list.push(st);
    else groups.set(c.rowKey, [st]);
  }
  const rows: Row[] = [];
  for (const [rowKey, list] of groups) {
    if (!list.some((v) => v.runs > 0)) continue;
    const variants = list.slice().sort(betterConfig);
    const best = variants[0]!;
    rows.push({
      ...best,
      rowKey,
      model: best.candidate.model,
      reasoning: best.candidate.reasoning,
      label: rowLabel(index, best.candidate.model, best.candidate.reasoning),
      variants,
    });
  }
  return rows;
}

function tierValue(s: RowStats, id: string): number | null {
  if (id === OVERALL) return s.overall.score;
  return s.tier[id]?.score ?? null;
}

function sortValue(index: SuiteIndex, key: string, s: Row): number | string | null {
  if (key === 'model') return (s.label || rowLabel(index, s.model, s.reasoning)).toLowerCase();
  if (key === 'time') return s.time;
  if (key === 'tps') return s.tps;
  if (key === 'cost') return s.cost;
  return tierValue(s, key);
}

/**
 * Leaderboard order for a sort key: rows with runs first, in-progress last, partial scores after full ones
 * (for tier and overall keys); nulls last in either direction; ties by label. Sorts a copy.
 */
export function sortRows(index: SuiteIndex, rows: readonly Row[], sort: SortSpec): Row[] {
  const info = cacheOf(index).info;
  const tierKey = sort.key === OVERALL || info.tiers.some((t) => t.id === sort.key);
  const resultOf = (s: Row) => (sort.key === OVERALL ? s.overall : (s.tier[sort.key] ?? null));
  return rows.slice().sort((a, b) => {
    if (a.ran !== b.ran) return a.ran ? -1 : 1;
    if (a.inProgress !== b.inProgress) return a.inProgress ? 1 : -1;
    if (tierKey) {
      const ra = resultOf(a),
        rb = resultOf(b);
      const pa = !ra || ra.partial || ra.score === null;
      const pb = !rb || rb.partial || rb.score === null;
      if (pa !== pb) return pa ? 1 : -1;
    }
    const va = sortValue(index, sort.key, a),
      vb = sortValue(index, sort.key, b);
    const na = va === null || va === undefined;
    const nb = vb === null || vb === undefined;
    // Rows with no value come last whichever way the column sorts; among themselves by label, so the
    // order never depends on input order (the old comparator left it to the sort algorithm)
    if (na || nb) return na && nb ? (a.label < b.label ? -1 : 1) : na ? 1 : -1;
    if (va < vb) return -sort.dir;
    if (va > vb) return sort.dir;
    return a.label < b.label ? -1 : 1;
  });
}

/** A row is ranked when it ran, has finished and has a full overall score. */
export function isRanked(s: RowStats): boolean {
  return s.ran && !s.inProgress && s.overall.score !== null && !s.overall.partial;
}

/** True when no row has finished (every row would be in progress), so the board shows them all. */
export function noneFinished(rows: readonly RowStats[]): boolean {
  return !rows.some((s) => s.ran && !s.inProgress);
}

/** The rows the board shows: in-progress rows only when asked, or when nothing has finished. */
export function visibleRows<T extends RowStats>(rows: readonly T[], showInProgress: boolean): T[] {
  const showAll = showInProgress || noneFinished(rows);
  return rows.filter((r) => showAll || !r.inProgress);
}

/**
 * Rank of each ranked row: position by Overall, best first, whatever column the board is sorted by (B-07).
 * Rows that aren't ranked have no entry.
 */
export function rankRows(index: SuiteIndex, rows: readonly Row[]): Map<string, number> {
  const byOverall = sortRows(index, rows, { key: OVERALL, dir: -1 });
  const ranks = new Map<string, number>();
  let n = 0;
  for (const r of byOverall) if (isRanked(r)) ranks.set(r.rowKey, ++n);
  return ranks;
}
