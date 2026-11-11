// Shaping for the task pages (spec section 8). Pure and tolerant: nothing here reads the DOM, and an unknown
// or oddly typed field becomes an absent line, never an exception.
//
// Two sources: `index.json` (the catalog, setups and their labels: always loaded) and
// `<suite>/tasks/<task>.json` (the full task and its slim runs: loaded on demand).

import { suiteInfo, type SuiteInfo } from '$lib/core/catalog';
import type { DataContext } from '$lib/core/context';
import { cap } from '$lib/core/format';
import { betterConfig, rowLabel, viewFor, type RowStats } from '$lib/core/scoring';
import type { CatalogTask, Setup, SuiteIndex } from '$lib/core/types';

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const EPS = 1e-9;

export const plural = (n: number, one: string, many = one + 's') =>
  `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

export function mean(values: readonly (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function median(values: readonly (number | null | undefined)[]): number | null {
  const v = values
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    .sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** `names-for-one-character` -> `Names for one character`. */
export const readableId = (id: string) => cap(id.replace(/[-_]+/g, ' '));

/** Tokens: `842`, `1.2k`, `12k` (TASK-PERF-02). */
export function fmtTokens(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v >= 10000
    ? Math.round(v / 1000) + 'k'
    : v >= 1000
      ? (v / 1000).toFixed(1) + 'k'
      : String(Math.round(v));
}

/** `v4` stays, `4.0` becomes `v4.0`. */
export const suiteLabel = (v: string) => (/^v/i.test(v) ? v : 'v' + v);

// ---- The task file -----------------------------------------------------------------------------------

export interface TaskCriterion {
  label: string;
  max: number | null;
}

export interface TaskFull {
  id: string;
  name: string;
  aliases: string[];
  mode: string | null;
  area: string | null;
  tier: string | null;
  status: string | null;
  version: number | null;
  rubricVersion: number | null;
  addedIn: string | null;
  method: string | null;
  unit: string | null;
  total: number | null;
  scale: number;
  prompt: string;
  summary: string;
  rules: string[];
  criteria: TaskCriterion[];
}

/** One slim run of the task file. */
export interface SlimRun {
  uuid: string;
  setup: string;
  state: string;
  score: number | null;
  outcome: string | null;
  elapsed: number | null;
  cost: number | null;
  startedAt: string | null;
}

export interface TaskFile {
  suite: string;
  task: TaskFull;
  runs: SlimRun[];
}

/** Provisional means any status but active or retired (TASK-CTRL-02). */
export const isProvisional = (status: string | null | undefined) =>
  status !== 'active' && status !== 'retired';

export function parseTaskFile(raw: unknown, fallbackSuite = ''): TaskFile | null {
  const r = rec(raw);
  const t = rec(r.task);
  const id = str(t.id);
  if (!id) return null;
  const sc = rec(t.scoring);
  const rules = arr(t.rules)
    .map((x) => (typeof x === 'string' ? x : (str(rec(x).label) ?? str(rec(x).id))))
    .filter((x): x is string => !!x);
  const criteria = arr(t.criteria)
    .map(rec)
    .map((c) => ({ label: str(c.label) ?? str(c.id) ?? '', max: num(c.max_score) }))
    .filter((c) => c.label);
  const task: TaskFull = {
    id,
    name: str(t.name) ?? readableId(id),
    aliases: arr(t.aliases).filter((a): a is string => typeof a === 'string'),
    mode: str(t.mode),
    area: str(t.area),
    tier: str(t.tier),
    status: str(t.status),
    version: num(t.version),
    rubricVersion: num(t.rubric_version),
    addedIn: str(t.added_in),
    method: str(sc.method),
    unit: str(sc.unit),
    total: num(sc.total),
    scale: num(sc.scale) ?? 10,
    prompt: typeof t.prompt === 'string' ? t.prompt : '',
    summary: typeof t.summary === 'string' ? t.summary : '',
    rules,
    criteria,
  };
  const runs: SlimRun[] = [];
  for (const x of arr(r.runs)) {
    const o = rec(x);
    const uuid = str(o.run_uuid);
    if (!uuid) continue;
    runs.push({
      uuid,
      setup: str(o.setup) ?? '',
      state: str(o.state) ?? 'unknown',
      score: num(o.score),
      outcome: str(o.outcome),
      elapsed: num(o.elapsed_s),
      cost: num(o.cost),
      startedAt: str(o.started_at),
    });
  }
  return { suite: str(r.suite) ?? fallbackSuite, task, runs };
}

// ---- Finding a task ----------------------------------------------------------------------------------

/** A task by catalog id or any alias (TASK-URL-02). */
export function resolveTask(catalog: SuiteIndex['catalog'], id: string): CatalogTask | null {
  const tasks = suiteInfo(catalog).tasks;
  return tasks.find((t) => t.id === id) ?? tasks.find((t) => t.aliases?.includes(id)) ?? null;
}

export const taskName = (t: { id: string; name?: string | null }) => t.name || readableId(t.id);

/** Up to 5 listed (active, or provisional when shown) tasks whose id or name contains the text (TASK-MISSING-01). */
export function similarTasks(
  catalog: SuiteIndex['catalog'],
  id: string,
  showProvisional: boolean,
  limit = 5,
): CatalogTask[] {
  const q = id.toLowerCase();
  if (!q) return [];
  return suiteInfo(catalog)
    .tasks.filter((t) => t.status === 'active' || (isProvisional(t.status) && showProvisional))
    .filter((t) => t.id.toLowerCase().includes(q) || taskName(t).toLowerCase().includes(q))
    .slice(0, limit);
}

// ---- The index ---------------------------------------------------------------------------------------

export interface IndexItem {
  task: CatalogTask;
  name: string;
  tierLabel: string;
  provisional: boolean;
  /** "Scored by hidden tests, 43 tests" from the catalog (the one-line summary is not in index.json). */
  scoredBy: string;
}

export interface IndexArea {
  id: string;
  label: string;
  items: IndexItem[];
}

export interface IndexSection {
  id: string;
  label: string;
  blurb: string;
  count: number;
  areas: IndexArea[];
}

export function methodLabel(catalog: SuiteIndex['catalog'], method: string | null | undefined): string {
  if (!method) return 'unknown method';
  return catalog.scoring_methods?.[method]?.label || method;
}

export function scoredBy(catalog: SuiteIndex['catalog'], t: CatalogTask): string {
  const sc = t.scoring ?? {};
  const total =
    typeof sc.total === 'number' ? `, ${sc.total.toLocaleString('en')} ${sc.unit || 'points'}` : '';
  return `Scored by ${methodLabel(catalog, sc.method)}${total}`;
}

/**
 * The shown tasks (active, plus provisional ones when asked) by section and area (TASK-INDEX-01..03).
 * `section` is a mode id or `combined` (all sections). A task whose mode or area the catalog doesn't list gets
 * a generic group at the end instead of vanishing.
 */
export function indexSections(index: SuiteIndex, section: string, showProvisional: boolean): IndexSection[] {
  const info = suiteInfo(index.catalog);
  const shown = info.tasks.filter(
    (t) => t.status === 'active' || (isProvisional(t.status) && showProvisional),
  );
  const tierPos = new Map(info.tiers.map((t, i) => [t.id as string, i]));
  const out: IndexSection[] = [];
  const modeIds = info.modes.map((m) => m.id as string);
  for (const t of shown) if (!modeIds.includes(t.mode ?? '')) modeIds.push(t.mode ?? '');
  for (const modeId of modeIds) {
    if (section !== 'combined' && section !== modeId) continue;
    const inMode = shown.filter((t) => (t.mode ?? '') === modeId);
    if (!inMode.length) continue;
    const mode = info.mode(modeId);
    const areaIds = [...(mode?.areas ?? [])];
    for (const t of inMode) if (!areaIds.includes(t.area ?? '')) areaIds.push(t.area ?? '');
    const areas: IndexArea[] = [];
    for (const aid of areaIds) {
      const list = inMode.filter((t) => (t.area ?? '') === aid);
      if (!list.length) continue;
      list.sort(
        (a, b) =>
          (tierPos.get(a.tier ?? '') ?? 0) - (tierPos.get(b.tier ?? '') ?? 0) ||
          taskName(a).localeCompare(taskName(b)),
      );
      areas.push({
        id: aid,
        label: index.catalog.areas.find((a) => a.id === aid)?.label ?? (aid ? cap(aid) : 'Other'),
        items: list.map((t) => ({
          task: t,
          name: taskName(t),
          tierLabel: info.tier(t.tier ?? '').label,
          provisional: isProvisional(t.status),
          scoredBy: scoredBy(index.catalog, t),
        })),
      });
    }
    out.push({
      id: modeId,
      label: mode?.label ?? (modeId ? cap(modeId) : 'Other'),
      blurb: mode?.blurb ? cap(mode.blurb) : '',
      count: inMode.length,
      areas,
    });
  }
  return out;
}

/** Provisional tasks of a section (or of all sections), for the toggle's note (TASK-CTRL-01). */
export function provisionalCount(index: SuiteIndex, section: string): number {
  return suiteInfo(index.catalog).tasks.filter(
    (t) => isProvisional(t.status) && (section === 'combined' || t.mode === section),
  ).length;
}

// ---- Entries (one per setup) -------------------------------------------------------------------------

export interface Entry {
  setup: Setup;
  /** The model's name, with its reasoning level when it is not the default. */
  label: string;
  /** The leaderboard row's key: a model at a reasoning level. */
  rowKey: string;
  local: boolean;
  runs: SlimRun[];
  mean: number;
  time: number | null;
  cost: number | null;
  /** The newest scored run: where the score link goes (B-21). */
  latest: SlimRun;
}

export function byScore(a: Entry, b: Entry): number {
  if (a.mean !== b.mean) return b.mean - a.mean;
  const ta = a.time === null ? Infinity : a.time;
  const tb = b.time === null ? Infinity : b.time;
  return ta === tb ? 0 : ta - tb;
}

export interface Built {
  entries: Entry[];
  /** Runs of the task by state, for the "exist but don't count" line. */
  states: Record<string, number>;
  /** Counted runs of setups the filters leave out. */
  filteredOut: number;
  /** Counted runs whose setup the index doesn't know. */
  unknownSetup: number;
  /** Counted runs without a numeric score. */
  unscored: number;
}

/**
 * One entry per setup with counted runs of the task (for a provisional task, its provisional runs), among
 * `allowed` setups (the ones the filters leave). Sorted by score, then time (TASK-ENTRY-01).
 */
export function buildEntries(
  index: SuiteIndex,
  task: Pick<TaskFull, 'status'>,
  runs: readonly SlimRun[],
  allowed: ReadonlySet<string> | null,
): Built {
  const want = isProvisional(task.status) ? 'provisional' : 'counted';
  const states: Record<string, number> = {};
  const bySetup = new Map<string, SlimRun[]>();
  let filteredOut = 0;
  let unknownSetup = 0;
  let unscored = 0;
  for (const r of runs) {
    states[r.state] = (states[r.state] ?? 0) + 1;
    if (r.state !== want) continue;
    if (!index.entities.setups[r.setup]) {
      unknownSetup += 1;
      continue;
    }
    if (r.score === null) {
      unscored += 1;
      continue;
    }
    if (allowed && !allowed.has(r.setup)) {
      filteredOut += 1;
      continue;
    }
    const l = bySetup.get(r.setup);
    if (l) l.push(r);
    else bySetup.set(r.setup, [r]);
  }
  const entries: Entry[] = [];
  for (const [id, list] of bySetup) {
    const setup = index.entities.setups[id]!;
    list.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '') || b.uuid.localeCompare(a.uuid));
    entries.push({
      setup,
      label: rowLabel(index, setup.model, setup.reasoning),
      rowKey: `${setup.model}~${setup.reasoning}`,
      local: setup.where === 'local',
      runs: list,
      mean: mean(list.map((r) => r.score)) ?? 0,
      time: median(list.map((r) => r.elapsed)),
      cost: mean(list.map((r) => r.cost)),
      latest: list[0]!,
    });
  }
  entries.sort(byScore);
  return { entries, states, filteredOut, unknownSetup, unscored };
}

/** Runs that exist but never count here: every state but the wanted one (TASK-EMPTY-01). */
export function notCounted(states: Record<string, number>, task: Pick<TaskFull, 'status'>): number {
  const want = isProvisional(task.status) ? 'provisional' : 'counted';
  return Object.entries(states).reduce((n, [k, v]) => (k === want ? n : n + v), 0);
}

/**
 * Each model's best setup, the one its leaderboard row uses (`betterConfig` on the section's stats), ranked by
 * score here (TASK-PERF-01). A setup the section view doesn't know falls back to score order.
 */
export function bestPerModel(index: SuiteIndex, mode: string | null, entries: readonly Entry[]): Entry[] {
  const stats = new Map<string, RowStats>();
  if (mode) {
    try {
      const view = viewFor(index, mode, true);
      for (const c of view.candidates()) stats.set(c.first.id, view.stats(c));
    } catch {
      /* fall back to score order */
    }
  }
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const g = groups.get(e.rowKey);
    if (g) g.push(e);
    else groups.set(e.rowKey, [e]);
  }
  const best: Entry[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => {
      const sa = stats.get(a.setup.id);
      const sb = stats.get(b.setup.id);
      return (sa && sb ? betterConfig(sa, sb) : 0) || byScore(a, b);
    });
    best.push(g[0]!);
  }
  return best.sort(byScore);
}

// ---- Tiles -------------------------------------------------------------------------------------------

export interface Tiles {
  setups: number;
  models: number;
  local: number;
  cloud: number;
  scale: number;
  maxed: number;
  median: number | null;
  min: number | null;
  top: number | null;
  fastest: Entry | null;
}

export function tiles(entries: readonly Entry[], scale: number): Tiles {
  const scores = entries.map((e) => e.mean);
  const top = scores.length ? Math.max(...scores) : null;
  const fastest =
    top === null
      ? null
      : (entries.filter((e) => e.mean + EPS >= top && e.time !== null).sort((a, b) => a.time! - b.time!)[0] ??
        null);
  const local = entries.filter((e) => e.local).length;
  return {
    setups: entries.length,
    models: new Set(entries.map((e) => e.setup.model)).size,
    local,
    cloud: entries.length - local,
    scale,
    maxed: entries.filter((e) => e.mean + EPS >= scale).length,
    median: median(scores),
    min: scores.length ? Math.min(...scores) : null,
    top,
    fastest,
  };
}

/** Whether a prompt is shown collapsed (TASK-ASKS-01). */
export function isLongPrompt(text: string): boolean {
  return text.split('\n').length > 12 || text.length > 1100;
}

// ---- Per-check results (from the run files) ------------------------------------------------------------

export interface CheckGroup {
  key: string;
  /** 0..1 */
  value: number;
}

export interface RunDetail {
  groups: CheckGroup[];
  tokensOut: number | null;
}

/** The checks of one run file, grouped. Tolerant: nothing found is an empty list. */
export function parseRunDetail(raw: unknown, suite: string): RunDetail {
  const r = rec(raw);
  const scores = arr(r.scores).map(rec);
  const ref = rec(rec(rec(r.suites)[suite]).score_ref);
  const chosen =
    scores.find(
      (s) =>
        ref.rubric_version !== undefined &&
        s.rubric_version === ref.rubric_version &&
        s.method === ref.method,
    ) ??
    scores[0] ??
    {};
  const out: CheckGroup[] = [];
  for (const g of arr(chosen.groups).map(rec)) {
    const key = str(g.id) ?? str(g.label);
    const total = num(g.total);
    const passed = num(g.passed);
    if (key && total && total > 0 && passed !== null)
      out.push({ key, value: Math.max(0, Math.min(1, passed / total)) });
  }
  if (!out.length) {
    const acc = new Map<string, number[]>();
    for (const it of arr(chosen.items).map(rec)) {
      const key = str(it.group) ?? str(it.label) ?? str(it.id);
      if (!key) continue;
      const share = num(it.share) ?? (it.passed === true ? 1 : it.passed === false ? 0 : null);
      if (share === null) continue;
      const l = acc.get(key);
      if (l) l.push(share);
      else acc.set(key, [share]);
    }
    for (const [key, v] of acc) out.push({ key, value: mean(v) ?? 0 });
  }
  const metrics = rec(rec(r.summary).metrics);
  return { groups: out, tokensOut: num(metrics.tokens_out) };
}

export interface CheckStat {
  key: string;
  rate: number;
  n: number;
  full: number;
}

/** Pass rate of each check over the entries' newest runs, hardest first (TASK-CHECKS-01). */
export function checkStats(entries: readonly Entry[], details: ReadonlyMap<string, RunDetail>): CheckStat[] {
  const by = new Map<string, number[]>();
  for (const e of entries) {
    const d = details.get(e.latest.uuid);
    if (!d) continue;
    for (const g of d.groups) {
      const l = by.get(g.key);
      if (l) l.push(g.value);
      else by.set(g.key, [g.value]);
    }
  }
  return [...by]
    .map(([key, v]) => ({
      key,
      rate: mean(v) ?? 0,
      n: v.length,
      full: v.filter((x) => x + EPS >= 1).length,
    }))
    .sort((a, b) => a.rate - b.rate || a.key.localeCompare(b.key));
}

/** Column order for the performers' check squares: the catalog's criteria first, then first seen. */
export function checkColumns(
  entries: readonly Entry[],
  details: ReadonlyMap<string, RunDetail>,
  criteria: readonly string[],
): string[] {
  const seen: string[] = [];
  for (const e of entries) {
    for (const g of details.get(e.latest.uuid)?.groups ?? []) if (!seen.includes(g.key)) seen.push(g.key);
  }
  const rank = (k: string) => {
    const i = criteria.indexOf(k);
    return i === -1 ? 1e6 : i;
  };
  return seen
    .map((k, i) => ({ k, i }))
    .sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i)
    .map((x) => x.k);
}

export type SquareKind = 'pass' | 'fail' | 'partial' | 'none';

export function square(value: number | null | undefined): { kind: SquareKind; mark: string; text: string } {
  if (value === null || value === undefined) return { kind: 'none', mark: '', text: 'not recorded' };
  if (value + EPS >= 1) return { kind: 'pass', mark: '✓', text: 'passed' };
  if (value > EPS) return { kind: 'partial', mark: '~', text: `partly passed (${Math.round(value * 100)}%)` };
  return { kind: 'fail', mark: '✕', text: 'failed' };
}

// ---- Charts ------------------------------------------------------------------------------------------

export interface SpreadDot {
  entry: Entry;
  /** Position in its stack, 0 at the baseline. */
  stack: number;
}

export interface SpreadLayout {
  r: number;
  step: number;
  plotH: number;
  maxStack: number;
  dots: SpreadDot[];
}

/** Dots stacked where scores coincide (binned to one decimal); the step shrinks to fit `room` px (TASK-SPREAD-01). */
export function spreadLayout(entries: readonly Entry[], room = 230): SpreadLayout {
  const bins = new Map<string, Entry[]>();
  let maxStack = 1;
  for (const e of entries) {
    const k = e.mean.toFixed(1);
    const l = bins.get(k) ?? [];
    l.push(e);
    bins.set(k, l);
    maxStack = Math.max(maxStack, l.length);
  }
  let r = 5;
  let step = 11;
  if (maxStack * step > room) {
    step = room / maxStack;
    r = Math.max(2.5, step / 2 - 0.5);
  }
  const dots: SpreadDot[] = [];
  for (const l of bins.values()) l.forEach((entry, stack) => dots.push({ entry, stack }));
  return { r, step, plotH: Math.max(60, maxStack * step + 8), maxStack, dots };
}

export type Measure = 'time' | 'tokens' | 'cost';

export const MEASURES: Record<Measure, { label: string; axis: string }> = {
  time: { label: 'Time', axis: 'Median time per run' },
  tokens: { label: 'Tokens out', axis: 'Tokens out of the newest run' },
  cost: { label: 'Cost', axis: 'Mean cost per run' },
};

export interface EffortPoint {
  entry: Entry;
  value: number;
}

/** Setups with a positive value of the measure; `skipped` is how many are left off (TASK-EFFORT-01). */
export function effortPoints(
  entries: readonly Entry[],
  measure: Measure,
  tokens: ReadonlyMap<string, number | null>,
): { points: EffortPoint[]; skipped: number } {
  const of = (e: Entry) =>
    measure === 'time' ? e.time : measure === 'cost' ? e.cost : (tokens.get(e.latest.uuid) ?? null);
  const points: EffortPoint[] = [];
  for (const entry of entries) {
    const v = of(entry);
    if (v !== null && v > 0) points.push({ entry, value: v });
  }
  return { points, skipped: entries.length - points.length };
}

/** The log-x domain of the points, padded (a lone value gets a visible span). */
export function logDomain(values: readonly number[]): [number, number] {
  let lo = Math.log10(Math.min(...values));
  let hi = Math.log10(Math.max(...values));
  if (hi - lo < 0.5) {
    lo -= 0.25;
    hi += 0.25;
  }
  return [lo - 0.1, hi + 0.1];
}

/** Gridline values at 1 and 3 of each decade inside the domain. */
export function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let ex = Math.ceil(lo); ex <= Math.floor(hi); ex++) {
    for (const k of [1, 3]) {
      const v = k * Math.pow(10, ex);
      if (Math.log10(v) >= lo && Math.log10(v) <= hi) out.push(v);
    }
  }
  return out;
}

export interface Placed {
  entry: Entry;
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
}

type Box = [number, number, number, number];
const hit = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/**
 * Labels for each model's best setup: four positions tried, the first that touches no other label or dot and
 * stays inside the chart wins; a model with no free spot goes unlabelled (TASK-EFFORT-01).
 */
export function placeLabels(
  dots: readonly { entry: Entry; px: number; py: number }[],
  named: readonly Entry[],
  width: number,
  height: number,
  nameOf: (e: Entry) => string,
): Placed[] {
  const boxes = dots.map((d) => ({ d, box: [d.px - 7, d.py - 7, d.px + 7, d.py + 7] as Box }));
  const placed: Box[] = [];
  const out: Placed[] = [];
  for (const e of named) {
    const d = dots.find((q) => q.entry === e);
    if (!d) continue;
    let text = nameOf(e);
    if (text.length > 24) text = text.slice(0, 23) + '…';
    const w = text.length * 6.3 + 2;
    const h = 12;
    const cands: { x: number; y: number; anchor: 'start' | 'end'; b: Box }[] = [
      { x: d.px + 9, y: d.py + 4, anchor: 'start', b: [d.px + 8, d.py - 8, d.px + 10 + w, d.py + 6] },
      { x: d.px - 9, y: d.py + 4, anchor: 'end', b: [d.px - 10 - w, d.py - 8, d.px - 8, d.py + 6] },
      {
        x: d.px - w / 2,
        y: d.py - 10,
        anchor: 'start',
        b: [d.px - w / 2, d.py - 10 - h + 2, d.px + w / 2, d.py - 9],
      },
      {
        x: d.px - w / 2,
        y: d.py + 20,
        anchor: 'start',
        b: [d.px - w / 2, d.py + 8, d.px + w / 2, d.py + 22],
      },
    ];
    for (const c of cands) {
      if (c.b[0] < 0 || c.b[2] > width || c.b[1] < 0 || c.b[3] > height) continue;
      if (placed.some((p) => hit(p, c.b))) continue;
      if (boxes.some((q) => q.d !== d && hit(q.box, c.b))) continue;
      placed.push(c.b);
      out.push({ entry: e, text, x: c.x, y: c.y, anchor: c.anchor });
      break;
    }
  }
  return out;
}

// ---- Harnesses ---------------------------------------------------------------------------------------

export interface HarnessRow {
  id: string;
  /** Position among the section's harnesses (colour and marker). */
  index: number;
  entries: Entry[];
  mean: number | null;
  best: number | null;
  time: number | null;
}

export function harnessRows(entries: readonly Entry[], harnesses: readonly string[]): HarnessRow[] {
  return harnesses
    .map((id, index) => {
      const list = entries.filter((e) => e.setup.harness === id);
      return {
        id,
        index,
        entries: list,
        mean: mean(list.map((e) => e.mean)),
        best: list.length ? Math.max(...list.map((e) => e.mean)) : null,
        time: median(list.map((e) => e.time)),
      };
    })
    .filter((r) => r.entries.length);
}

export interface Dumbbell {
  name: string;
  /** One entry per harness, in the section's harness order. */
  members: Entry[];
  min: number;
  max: number;
}

/**
 * Setups identical in model, reasoning, quant, hardware, provider and where that ran on two or more harnesses;
 * best score first (TASK-HARNESS-02). The name gains quant and hardware (or the provider) when a model has several.
 */
export function dumbbells(entries: readonly Entry[], harnesses: readonly string[]): Dumbbell[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const s = e.setup;
    const k = [s.model, s.reasoning, s.quant, s.hw, s.provider, s.where].join('|');
    const l = groups.get(k);
    if (l) l.push(e);
    else groups.set(k, [e]);
  }
  const pairs = [...groups.values()].filter((g) => new Set(g.map((e) => e.setup.harness)).size > 1);
  const perModel = new Map<string, number>();
  for (const g of pairs) {
    const k = g[0]!.setup.model;
    perModel.set(k, (perModel.get(k) ?? 0) + 1);
  }
  const pos = (id: string) => {
    const i = harnesses.indexOf(id);
    return i === -1 ? 1e6 : i;
  };
  return pairs
    .map((g) => {
      const first = g[0]!;
      let name = first.label;
      if ((perModel.get(first.setup.model) ?? 0) > 1) {
        name +=
          ' · ' +
          (first.local
            ? [first.setup.quant, first.setup.hw].filter(Boolean).join(' ') || 'local'
            : (first.setup.labels.provider ?? first.setup.provider ?? 'cloud'));
      }
      const members = g.slice().sort((a, b) => pos(a.setup.harness) - pos(b.setup.harness));
      const scores = members.map((e) => e.mean);
      return { name, members, min: Math.min(...scores), max: Math.max(...scores) };
    })
    .sort((a, b) => b.max - a.max);
}

// ---- Labels and context ------------------------------------------------------------------------------

/** The Setup column: variant (quant, reasoning, harness when the section has several). */
export function variantText(s: Setup, withHarness: boolean, harnessLabel: (id: string) => string): string {
  const parts: string[] = [];
  if (s.quant === 'unrecorded') parts.push('quant not recorded');
  else if (s.quant) parts.push(s.quant);
  if (s.reasoning && s.reasoning !== 'default') parts.push(`reasoning ${s.reasoning}`);
  if (withHarness && s.harness) parts.push(harnessLabel(s.harness));
  return parts.length ? parts.join(' · ') : s.where === 'cloud' ? 'API' : 'default';
}

export function deploymentText(index: SuiteIndex, s: Setup): string {
  return index.entities.deployments[s.deployment]?.label || s.labels.provider || s.labels.hw || s.deployment;
}

export function harnessLabelOf(info: SuiteInfo, id: string): string {
  return info.harnesses.find((h) => h.id === id)?.label || id;
}

/** The context the page's scope uses: the task's own section, never Combined (a task belongs to one mode). */
export function taskContext(
  ctx: DataContext,
  task: { mode: string | null },
  provisional: boolean,
): DataContext {
  return {
    ...ctx,
    section: (task.mode ?? ctx.section) as DataContext['section'],
    provisional: ctx.provisional || provisional,
  };
}

/**
 * A copy of the index whose cells are only this task's, so every count the shared panel and `scope()` make
 * ("setups", facet options) is about the setups that ran it and nothing else.
 */
export function indexForTask(index: SuiteIndex, taskId: string): SuiteIndex {
  return { ...index, cells: index.cells.filter((c) => c.task === taskId) };
}
