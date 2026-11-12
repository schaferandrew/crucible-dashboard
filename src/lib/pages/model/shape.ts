// Shaping for the model pages (B-19). Every block is derived from one `scope()` of the shared DataContext with
// `model` pinned. Variant (quant, packager, format, reasoning, harness) and deployment (hardware, where,
// provider) are ordinary filters: a table row *sets* those filters, and picking it again clears them. Rows
// outside the filters stay in the table, dimmed; a row that would leave nothing is disabled.
//
// The unit of a score is a setup: the headline (tiles, areas, tasks, A/B) is the best setup in scope, the
// same rule as a leaderboard row. Nothing here filters by itself: `passes()` from the core decides.

import { UNRECORDED, type DataContext, type Dim, type Filters } from '$lib/core/context';
import { cap } from '$lib/core/format';
import { facetValue, passes, scope, type Scope } from '$lib/core/scope';
import { betterConfig, cellsOf, isRanked, type Row, type RowStats, type View } from '$lib/core/scoring';
import type { Cell, CatalogTask, Setup, SuiteIndex } from '$lib/core/types';
import {
  cellKey,
  depStats,
  median,
  mean,
  pickRuns,
  scoredRunOf,
  type DepStats,
  type RunsByCell,
  type SlimRun,
} from './runs';

export const UNKNOWN_MAKER = 'unknown';

/** The dimensions that tell variants of one model apart. */
export const VARIANT_DIMS: readonly Dim[] = ['quant', 'packager', 'format', 'reasoning', 'harness'];
/** The dimensions that tell deployments apart. */
export const DEPLOYMENT_DIMS: readonly Dim[] = ['hw', 'where', 'provider', 'deployment'];

export const DIM_NAMES: Record<string, string> = {
  quant: 'Quant',
  packager: 'Packager',
  format: 'Format',
  reasoning: 'Reasoning',
  harness: 'Harness',
};

export const makerLabelOf = (index: SuiteIndex, maker: string): string =>
  maker === UNKNOWN_MAKER ? 'Unknown maker' : (index.entities.makers[maker]?.label ?? maker);

// ---- Contexts ----

/** The same context with only `model` kept: the whole model in the section, whatever the reader filtered. */
export function wholeModel(ctx: DataContext): DataContext {
  const filters: Filters = ctx.filters.model ? { model: ctx.filters.model } : {};
  return { ...ctx, filters };
}

/** The context with the given dimensions' filters dropped (what picking a value of them would leave). */
export function without(ctx: DataContext, dims: readonly Dim[]): DataContext {
  const filters: Record<string, ReadonlySet<string>> = {};
  for (const [d, s] of Object.entries(ctx.filters)) if (s && !dims.includes(d as Dim)) filters[d] = s;
  return { ...ctx, filters };
}

const onlyValue = (set: ReadonlySet<string> | undefined, v: string) => !!set && set.size === 1 && set.has(v);

/** True when every key of `target` is picked as exactly that value. */
export function isPicked(filters: Filters, target: Partial<Record<Dim, string>>): boolean {
  const keys = Object.keys(target) as Dim[];
  return keys.length > 0 && keys.every((k) => onlyValue(filters[k], target[k]!));
}

/** Pick `target` (replacing `clear` dimensions), or clear them all when it is already the pick. */
export function toggleFilters(
  ctx: DataContext,
  target: Partial<Record<Dim, string>>,
  clear: readonly Dim[],
): DataContext {
  const picked = isPicked(ctx.filters, target);
  const filters: Record<string, ReadonlySet<string>> = {};
  for (const [d, s] of Object.entries(ctx.filters)) if (s && !clear.includes(d as Dim)) filters[d] = s;
  if (!picked) for (const [d, v] of Object.entries(target)) filters[d] = new Set([v]);
  return { ...ctx, filters };
}

// ---- Variants ----

/** Which variant dimensions differ among a model's setups in the view (a dimension that doesn't is not shown). */
export function varyingDims(setups: readonly Setup[], combined: boolean): Dim[] {
  return VARIANT_DIMS.filter((d) => !(d === 'harness' && combined)).filter(
    (d) => new Set(setups.map((s) => facetValue(s, d))).size > 1,
  );
}

export function harnessLabel(index: SuiteIndex, id: string): string {
  return index.catalog.harnesses.find((h) => h.id === id)?.label ?? id;
}

/** `Q4_K_M · reasoning on · pi`: only the dimensions asked for; local weights are named, a cloud model's are not. */
export function variantText(index: SuiteIndex, s: Setup, dims: readonly Dim[]): string {
  const parts: string[] = [];
  const local = s.where === 'local';
  if (local && dims.includes('quant'))
    parts.push(s.quant === UNRECORDED ? 'quant not recorded' : (s.quant ?? ''));
  if (local && dims.includes('packager'))
    parts.push(s.packager === UNRECORDED ? 'packager not recorded' : (s.labels.packager ?? s.packager ?? ''));
  if (local && dims.includes('format') && s.format)
    parts.push(s.format === UNRECORDED ? 'format not recorded' : s.format);
  if (dims.includes('reasoning')) parts.push(`reasoning ${s.reasoning}`);
  if (dims.includes('harness')) parts.push(harnessLabel(index, s.harness));
  return parts.filter(Boolean).join(' · ');
}

/** The full variant label: quant (local), reasoning, and the harness when the view has several. */
export function fullVariantText(index: SuiteIndex, s: Setup, harnessVaries: boolean): string {
  return variantText(index, s, ['quant', 'reasoning', ...(harnessVaries ? (['harness'] as Dim[]) : [])]);
}

const variantKeyOf = (c: RowStats['candidate']) =>
  c.members
    .filter((m): m is Setup => !!m)
    .map((m) => m.variant)
    .join('+');

export interface VariantRow {
  key: string;
  label: string;
  /** The candidate shown: the variant's best setup in scope (or, dimmed, the one picking it would show). */
  stats: RowStats;
  inScope: boolean;
  /** Would leave nothing and isn't picked: not selectable. */
  disabled: boolean;
  picked: boolean;
  /** Setups of this variant in scope / in the whole model. */
  setups: { shown: number; total: number };
  deployments: { shown: number; total: number };
  /** The filters a click sets. */
  target: Partial<Record<Dim, string>>;
}

export interface VariantTable {
  dims: Dim[];
  rows: VariantRow[];
  /** Variant rows in scope / all. */
  shown: number;
  total: number;
  /** Dimensions a click replaces (variant dims, plus `where` when the model has local and cloud variants). */
  clear: Dim[];
}

function bestOf(list: readonly RowStats[]): RowStats | null {
  return list.length ? list.slice().sort(betterConfig)[0]! : null;
}

const flatStats = (sc: Scope): RowStats[] => sc.rows.flatMap((r) => r.variants);

export function variantTable(index: SuiteIndex, all: Scope, sc: Scope, ctx: DataContext): VariantTable {
  const combined = sc.view.kind === 'combined';
  const everything = flatStats(all);
  const ids = new Set(everything.flatMap((st) => st.candidate.members.map((m) => m?.id)));
  const setups = Object.values(index.entities.setups).filter((s) => ids.has(s.id));
  const dims = varyingDims(setups, combined);
  const hasLocal = setups.some((s) => s.where === 'local');
  const hasCloud = setups.some((s) => s.where !== 'local');
  const clear: Dim[] = [...dims, ...(hasLocal && hasCloud ? (['where'] as Dim[]) : [])];
  const inScope = new Set(flatStats(sc).map((st) => st.candidate.id));
  const picking = without(ctx, clear);

  const groups = new Map<string, RowStats[]>();
  for (const st of everything) {
    const k = variantKeyOf(st.candidate);
    const l = groups.get(k);
    if (l) l.push(st);
    else groups.set(k, [st]);
  }
  const rows: VariantRow[] = [];
  for (const [key, list] of groups) {
    const here = list.filter((st) => inScope.has(st.candidate.id));
    const would = list.filter((st) => passes(st.candidate.first, picking, sc.view));
    const shown = bestOf(here) ?? bestOf(would) ?? bestOf(list)!;
    const sample = shown.candidate.first;
    const target: Partial<Record<Dim, string>> = {};
    for (const d of dims) {
      const v = facetValue(sample, d);
      if (v !== null) target[d] = v;
    }
    if (hasLocal && hasCloud && sample.where !== 'local') target.where = sample.where;
    const picked = isPicked(ctx.filters, target);
    const deps = (l: RowStats[]) => new Set(l.map((st) => st.candidate.first.deployment)).size;
    rows.push({
      key,
      label: variantText(index, sample, dims) || fullVariantText(index, sample, false),
      stats: shown,
      inScope: here.length > 0,
      disabled: would.length === 0 && !picked,
      picked,
      setups: { shown: here.length, total: list.length },
      deployments: { shown: deps(here), total: deps(list) },
      target,
    });
  }
  // In Combined a variant is one setup per section; the harness filter doesn't exist there, so a label that
  // would repeat is told apart by the harnesses of its members
  if (combined) {
    const seen = new Map<string, number>();
    for (const r of rows) seen.set(r.label, (seen.get(r.label) ?? 0) + 1);
    for (const r of rows)
      if ((seen.get(r.label) ?? 0) > 1)
        r.label +=
          ' · ' +
          r.stats.candidate.members
            .filter((m): m is Setup => !!m)
            .map((m) => harnessLabel(index, m.harness))
            .join(' + ');
  }
  rows.sort((a, b) => Number(b.inScope) - Number(a.inScope) || betterConfig(a.stats, b.stats));
  return { dims, rows, shown: rows.filter((r) => r.inScope).length, total: rows.length, clear };
}

// ---- Deployments ----

export interface DeploymentRow {
  id: string;
  label: string;
  where: string;
  recorded: boolean;
  inScope: boolean;
  disabled: boolean;
  picked: boolean;
  packagers: string[];
  /** Sections the deployment has no runs in (Combined only). */
  missing: string[];
  /** Setups behind the numbers. */
  setups: Setup[];
  stats: DepStats | null;
  /** Setups on this deployment in scope / in the whole model. */
  count: { shown: number; total: number };
}

export interface DeploymentTable {
  rows: DeploymentRow[];
  shown: number;
  total: number;
}

export const isRecorded = (s: Setup): boolean =>
  s.where !== UNRECORDED && s.hw !== UNRECORDED && s.provider !== UNRECORDED;

/** The run states a view counts (provisional ones only with the preview on). */
export const countedStates = (ctx: DataContext): ReadonlySet<string> =>
  new Set(ctx.provisional ? ['counted', 'provisional'] : ['counted']);

export function deploymentTable(
  index: SuiteIndex,
  all: Scope,
  sc: Scope,
  ctx: DataContext,
  runs: readonly SlimRun[] | null,
): DeploymentTable {
  const view = sc.view;
  const inScope = new Set(sc.setups.map((s) => s.id as string));
  const picking = without(ctx, DEPLOYMENT_DIMS);
  const groups = new Map<string, Setup[]>();
  for (const s of all.setups) {
    const l = groups.get(s.deployment);
    if (l) l.push(s);
    else groups.set(s.deployment, [s]);
  }
  const taskIds = new Set<string>(view.taskIds);
  const states = countedStates(ctx);
  const rows: (DeploymentRow & { weight: number })[] = [];
  for (const [id, list] of groups) {
    const here = list.filter((s) => inScope.has(s.id));
    const would = list.filter((s) => passes(s, picking, view));
    const use = here.length ? here : would.length ? would : list;
    const dep = index.entities.deployments[id];
    const sample = list[0]!;
    const picked = isPicked(ctx.filters, { deployment: id });
    const packagers = [
      ...new Set(
        use
          .filter((s) => s.where === 'local')
          .map((s) => s.labels.packager ?? s.packager)
          .filter((p): p is string => !!p),
      ),
    ];
    const sections = new Set(use.flatMap((s) => s.modes as string[]));
    const missing =
      view.kind === 'combined' ? view.parts.filter((p) => !sections.has(p.id)).map((p) => p.label) : [];
    rows.push({
      id,
      label: dep?.label ?? id,
      where: sample.where,
      recorded: list.every(isRecorded),
      inScope: here.length > 0,
      disabled: would.length === 0 && !picked,
      picked,
      packagers,
      missing,
      setups: use,
      stats: runs
        ? depStats(
            pickRuns(runs, { setups: new Set(use.map((s) => s.id as string)), tasks: taskIds, states }),
          )
        : null,
      count: { shown: here.length, total: list.length },
      weight: list.reduce((n, s) => n + s.runs, 0),
    });
  }
  // Stable whatever the filters: recorded first, most runs first, then label
  rows.sort(
    (a, b) =>
      Number(b.recorded) - Number(a.recorded) || b.weight - a.weight || a.label.localeCompare(b.label),
  );
  return { rows, shown: rows.filter((r) => r.inScope).length, total: rows.length };
}

// ---- Headline, areas, tasks ----

/** The best setup in scope: what the tiles, areas and tasks are about. */
export function headline(sc: Scope): Row | null {
  return sc.rows[0] ?? null;
}

export interface AreaBar {
  key: string;
  label: string;
  score: number | null;
  n: number;
  total: number;
  state: 'counted' | 'not-run' | 'none-count';
  /** Measured on fewer than half the area's tasks. */
  pale: boolean;
}

export interface AreaGroupTask {
  task: CatalogTask;
  tierLabel: string;
  setup: Setup;
  cell: Cell | null;
  mean: number | null;
  counted: number;
  runs: number;
  repeat: { n: number; min: number; max: number } | null;
  provisional: boolean;
  /** Numbers from the setup's own runs (null until the runs are loaded, or when it has none). */
  time: number | null;
  timedOut: boolean;
  cost: number | null;
  run: string | null;
}

export interface AreaGroup {
  key: string;
  label: string;
  mean: number | null;
  counted: number;
  total: number;
  ranButNotCounted: number;
  tasks: AreaGroupTask[];
}

/** Areas of the headline, one group per area (per section in Combined, prefixed with the section). */
export function areaGroups(
  index: SuiteIndex,
  view: View,
  best: RowStats,
  runsByCell: RunsByCell | null,
  states: ReadonlySet<string>,
): AreaGroup[] {
  const out: AreaGroup[] = [];
  view.parts.forEach((P, i) => {
    const setup = best.candidate.members[i];
    if (!setup) return;
    const cells = cellsOf(index, setup.id);
    const catalogAreas = P.info.catalog.areas.filter((a) => a.mode === P.id || P.mode.areas.includes(a.id));
    const order = P.mode.areas.length ? P.mode.areas : catalogAreas.map((a) => a.id);
    const ordered = [...new Set([...order, ...catalogAreas.map((a) => a.id)])];
    for (const areaId of ordered) {
      const area = P.info.catalog.areas.find((a) => a.id === areaId);
      const tasks = P.tasks
        .filter((t) => t.area === areaId)
        .slice()
        .sort(
          (p, q) => P.tiers.findIndex((t) => t.id === p.tier) - P.tiers.findIndex((t) => t.id === q.tier),
        );
      if (!tasks.length) continue;
      const rows: AreaGroupTask[] = tasks.map((t) => {
        const cell = cells.get(t.id) ?? null;
        const prov = P.isProvisional(t.id);
        const block = prov ? cell?.provisional : cell?.counted;
        const m = typeof block?.mean === 'number' ? block.mean : null;
        const mine = runsByCell?.get(cellKey(setup.id, t.id)) ?? [];
        const used = mine.filter((r) => states.has(r.state));
        const fin = used.filter((r) => r.outcome === 'finished');
        const timed = fin.length ? fin : used;
        const found = scoredRunOf(mine, states);
        return {
          task: t,
          tierLabel: P.info.tier(t.tier ?? '').label,
          setup,
          cell,
          mean: m,
          counted: block?.n ?? 0,
          runs: cell?.runs ?? 0,
          repeat:
            block && block.n_scored > 1 && block.min !== null && block.max !== null
              ? { n: block.n_scored, min: block.min, max: block.max }
              : null,
          provisional: prov,
          time: median(timed.map((r) => r.elapsed_s)),
          timedOut: used.some((r) => r.outcome === 'timed_out'),
          cost: mean(used.map((r) => r.cost)),
          run: found?.run_uuid ?? null,
        };
      });
      const means = rows.map((r) => r.mean);
      out.push({
        key: `${P.id}:${areaId}`,
        label: (view.kind === 'combined' ? `${P.label} · ` : '') + (area?.label ?? cap(areaId)),
        mean: mean(means),
        counted: means.filter((m) => m !== null).length,
        total: tasks.length,
        ranButNotCounted: rows.filter((r) => r.mean === null && r.cell && r.runs > 0).length,
        tasks: rows,
      });
    }
  });
  return out;
}

export function areaBars(groups: readonly AreaGroup[]): AreaBar[] {
  return groups.map((g) => ({
    key: g.key,
    label: g.label,
    score: g.mean,
    n: g.counted,
    total: g.total,
    state: g.counted > 0 ? 'counted' : g.tasks.some((t) => t.runs > 0) ? 'none-count' : 'not-run',
    pale: g.counted * 2 < g.total,
  }));
}

// ---- Runs that didn't finish ----

export interface DidNotFinish {
  run: SlimRun;
  task: CatalogTask | null;
  deployment: string;
  recorded: boolean;
}

/** Counted runs of the in-scope setups that timed out or errored, in task order. */
export function didNotFinish(index: SuiteIndex, sc: Scope, runs: readonly SlimRun[]): DidNotFinish[] {
  const setups = new Map(sc.setups.map((s) => [s.id as string, s]));
  const order = new Map(sc.view.tasks.map((t, i) => [t.id as string, i]));
  const info = sc.view.info;
  return runs
    .filter(
      (r) => r.state === 'counted' && r.outcome !== 'finished' && setups.has(r.setup) && order.has(r.task),
    )
    .sort(
      (a, b) =>
        order.get(a.task)! - order.get(b.task)! || (b.started_at ?? '').localeCompare(a.started_at ?? ''),
    )
    .map((run) => {
      const s = setups.get(run.setup)!;
      return {
        run,
        task: info.taskById.get(run.task as never) ?? null,
        deployment: index.entities.deployments[s.deployment]?.label ?? s.deployment,
        recorded: isRecorded(s),
      };
    });
}

// ---- Other runs ----

/** Runs of the model that don't count, by state. With filters, only those of setups that pass them. */
export function otherCounts(
  index: SuiteIndex,
  model: string,
  ctx: DataContext,
  view: View,
  runs: readonly SlimRun[] | null,
): Record<string, number> {
  const active = Object.entries(ctx.filters).some(([d, s]) => d !== 'model' && s && s.size > 0);
  if (!active || !runs) return { ...(index.other[model] ?? {}) };
  const out: Record<string, number> = {};
  for (const r of runs) {
    const state = r.state === 'counted' && r.score === null ? 'unscored' : r.state;
    if (state === 'counted' || state === 'provisional') continue;
    const s = index.entities.setups[r.setup];
    if (s && !passes(s, ctx, view)) continue;
    out[state] = (out[state] ?? 0) + 1;
  }
  return out;
}

// ---- Index and maker pages ----

export interface MakerGroup {
  id: string;
  label: string;
  models: { id: string; name: string; variants: number; where: string[] }[];
}

/** Every model with results, under its maker: alphabetical, the unknown maker last. */
export function makerGroups(index: SuiteIndex): MakerGroup[] {
  const variants = new Map<string, Set<string>>();
  const where = new Map<string, Set<string>>();
  const bucket = (m: Map<string, Set<string>>, k: string) => m.get(k) ?? m.set(k, new Set()).get(k)!;
  for (const s of Object.values(index.entities.setups)) {
    bucket(variants, s.model).add(s.variant);
    bucket(where, s.model).add(s.where);
  }
  const by = new Map<string, MakerGroup>();
  for (const m of Object.values(index.entities.models)) {
    const id = m.maker || UNKNOWN_MAKER;
    let g = by.get(id);
    if (!g) by.set(id, (g = { id, label: makerLabelOf(index, id), models: [] }));
    g.models.push({
      id: m.id,
      name: m.label || m.id.slice(m.id.lastIndexOf('/') + 1),
      variants: variants.get(m.id)?.size ?? 0,
      where: [...(where.get(m.id) ?? [])].sort(),
    });
  }
  const groups = [...by.values()];
  for (const g of groups) g.models.sort((a, b) => a.name.localeCompare(b.name));
  return groups.sort(
    (a, b) =>
      Number(a.id === UNKNOWN_MAKER) - Number(b.id === UNKNOWN_MAKER) || a.label.localeCompare(b.label),
  );
}

/** A maker id, matched without regard to case (a hand-typed URL). */
export function findMaker(index: SuiteIndex, wanted: string): string | null {
  const ids = new Set<string>([
    ...Object.keys(index.entities.makers),
    ...Object.values(index.entities.models).map((m) => m.maker || UNKNOWN_MAKER),
  ]);
  if (ids.has(wanted)) return wanted;
  const lower = wanted.toLowerCase();
  return [...ids].find((i) => i.toLowerCase() === lower) ?? null;
}

export interface MakerEntry {
  model: { id: string; name: string };
  /** The model's best row in scope, null when it has none (not run in this section, or filtered out). */
  best: Row | null;
  variants: number;
  deployments: number;
}

/** One entry per model of the maker: ranked first (by Overall), then the rest, then models with no row. */
export function makerEntries(index: SuiteIndex, maker: string, sc: Scope): MakerEntry[] {
  const models = Object.values(index.entities.models).filter((m) => (m.maker || UNKNOWN_MAKER) === maker);
  const bestRow = new Map<string, Row>();
  for (const r of sc.rows) if (!bestRow.has(r.model)) bestRow.set(r.model, r);
  const entries = models.map<MakerEntry>((m) => {
    const best = bestRow.get(m.id) ?? null;
    const variants = new Set<string>();
    const deployments = new Set<string>();
    for (const r of sc.rows)
      if (r.model === m.id)
        for (const st of r.variants)
          for (const mem of st.candidate.members) if (mem) variants.add(mem.variant);
    if (best)
      for (const st of best.variants)
        if (st.candidate.first.variant === best.setup.variant) deployments.add(st.candidate.first.deployment);
    return {
      model: { id: m.id, name: m.label || m.id.slice(m.id.lastIndexOf('/') + 1) },
      best,
      variants: variants.size,
      deployments: deployments.size,
    };
  });
  const ranked = entries
    .filter((e) => e.best && isRanked(e.best))
    .sort(
      (a, b) => b.best!.overall.score! - a.best!.overall.score! || a.model.name.localeCompare(b.model.name),
    );
  const rest = entries
    .filter((e) => e.best && !isRanked(e.best))
    .sort((a, b) => betterConfig(a.best!, b.best!));
  const none = entries.filter((e) => !e.best).sort((a, b) => a.model.name.localeCompare(b.model.name));
  return [...ranked, ...rest, ...none];
}

/** The scope of a model with only the model pinned (its whole section), and the scope the reader's filters leave. */
export function scopesOf(index: SuiteIndex, ctx: DataContext): { all: Scope; sc: Scope } {
  return { all: scope(index, wholeModel(ctx)), sc: scope(index, ctx) };
}

/** The sections a model has setups in (for the default section, B-18). */
export function sectionsRan(index: SuiteIndex, model: string): string[] {
  const modes = new Set<string>();
  for (const s of Object.values(index.entities.setups))
    if (s.model === model) for (const m of s.modes) modes.add(m);
  return index.catalog.modes.map((m) => m.id as string).filter((m) => modes.has(m));
}

/** Local, cloud or both, from the model's setups. */
export function whereText(index: SuiteIndex, model: string): string {
  const w = new Set(
    Object.values(index.entities.setups)
      .filter((s) => s.model === model)
      .map((s) => s.where),
  );
  if (w.has('local') && w.size > 1) return 'Local and cloud';
  return w.has('local') ? 'Local' : w.size ? 'Cloud' : '';
}
