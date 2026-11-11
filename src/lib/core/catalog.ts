// Catalog helpers: everything about tiers, sections and tasks comes from the suite's catalog in
// index.json. Nothing here knows a task, area, mode, tier, label or threshold by name.

import { cap } from './format';
import type {
  Catalog,
  CatalogHarness,
  CatalogMode,
  CatalogTask,
  CatalogTier,
  Gate,
  ModeId,
  TaskId,
  TierId,
} from './types';
import { COMBINED, asModeId, asTierId } from './types';

const DEFAULT_COVERAGE_MIN = 0.75;
const DEFAULT_IN_PROGRESS_BELOW = 0.75;

export interface SuiteInfo {
  catalog: Catalog;
  /** Display order. A tier only tasks mention is appended with no role. */
  tiers: CatalogTier[];
  /** The first tier with role `headline`, else the first non-gate tier, else the first tier. */
  headline: CatalogTier;
  tier(id: string): CatalogTier;
  /** The gate of a gate tier with numeric thresholds, else null. */
  gateOf(id: string): Gate | null;
  modes: CatalogMode[];
  mode(id: string): CatalogMode | undefined;
  /** Combined needs at least two sections, and a catalog mode with the same id would win over it. */
  hasCombined: boolean;
  tasks: CatalogTask[];
  taskById: Map<TaskId, CatalogTask>;
  categoryWeights: Map<string, number>;
  coverageMin: number;
  inProgressBelow: number;
  harnesses: CatalogHarness[];
  overallLabel: string;
  combinedLabel: string;
}

const cache = new WeakMap<Catalog, SuiteInfo>();

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** A share meets a threshold at exactly the threshold (6 of 8 meets 0.75), whatever the float rounding. */
export function meets(share: number, min: number): boolean {
  return share + 1e-9 >= min;
}

export function suiteInfo(catalog: Catalog): SuiteInfo {
  const hit = cache.get(catalog);
  if (hit) return hit;

  const tasks = catalog.tasks.filter((t) => t && t.id);
  const taskById = new Map<TaskId, CatalogTask>(tasks.map((t) => [t.id, t]));

  const seen = new Set<string>();
  const tiers: CatalogTier[] = [];
  for (const t of catalog.tiers) {
    if (!t || !t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    tiers.push(t);
  }
  for (const t of tasks) {
    if (t.tier && !seen.has(t.tier)) {
      seen.add(t.tier);
      tiers.push({
        id: t.tier,
        label: cap(t.tier),
        blurb: '',
        detail: '',
        role: null,
        gate: null,
        order: 1000 + tiers.length,
      });
    }
  }
  if (!tiers.length) {
    tiers.push({
      id: asTierId('all'),
      label: 'Score',
      blurb: '',
      detail: '',
      role: null,
      gate: null,
      order: 0,
    });
  }
  // stable by (order, position)
  const sorted = tiers
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.order - b.t.order || a.i - b.i)
    .map((x) => x.t);

  const headline =
    sorted.find((t) => t.role === 'headline') ?? sorted.find((t) => t.role !== 'gate') ?? sorted[0]!;
  const byId = new Map(sorted.map((t) => [t.id as string, t]));

  const modes: CatalogMode[] = catalog.modes.slice();
  const modeIds = new Set(modes.map((m) => m.id as string));
  for (const t of tasks) {
    if (t.mode && !modeIds.has(t.mode)) {
      modeIds.add(t.mode);
      modes.push({
        id: t.mode,
        label: cap(t.mode),
        blurb: '',
        order: 1000 + modes.length,
        areas: [],
        harnesses: [],
      });
    }
  }
  const orderedModes = modes
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.order - b.m.order || a.i - b.i)
    .map((x) => x.m);

  const info: SuiteInfo = {
    catalog,
    tiers: sorted,
    headline,
    tier: (id) =>
      byId.get(id) ?? {
        id: asTierId(id),
        label: cap(id),
        blurb: '',
        detail: '',
        role: null,
        gate: null,
        order: 1e6,
      },
    gateOf: (id) => {
      const t = byId.get(id);
      const g = t?.gate;
      return t && t.role === 'gate' && g && typeof g.mean === 'number' && typeof g.min === 'number'
        ? g
        : null;
    },
    modes: orderedModes,
    mode: (id) => orderedModes.find((m) => m.id === id),
    hasCombined: orderedModes.length > 1 && !orderedModes.some((m) => (m.id as string) === COMBINED),
    tasks,
    taskById,
    categoryWeights: new Map(
      catalog.categories
        .filter((c) => c && c.id && typeof c.weight === 'number')
        .map((c) => [c.id, c.weight as number]),
    ),
    coverageMin: num(catalog.scoring_policy?.coverage_min, DEFAULT_COVERAGE_MIN),
    inProgressBelow: num(catalog.scoring_policy?.in_progress_below, DEFAULT_IN_PROGRESS_BELOW),
    harnesses: catalog.harnesses,
    overallLabel: catalog.labels?.overall || 'Overall',
    combinedLabel: catalog.labels?.combined?.label || 'Combined',
  };
  cache.set(catalog, info);
  return info;
}

/** The default section: Combined when the suite has at least two sections, else the first. */
export function defaultSection(info: SuiteInfo): ModeId | typeof COMBINED {
  return info.hasCombined ? COMBINED : (info.modes[0]?.id ?? asModeId(COMBINED));
}
