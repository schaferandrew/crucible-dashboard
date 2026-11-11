// Tolerant reading of site-data JSON. The contract may gain small fields later (cell `scored_run`, run
// `siblings`), and an older or newer file may lack one the core reads. `normalizeIndex` fills defaults and
// drops entries that cannot be used, so the scoring core never throws on unknown data and renders what it can.

import type { Meta, SuiteIndex } from './types';

type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const nstr = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function normalizeMeta(raw: unknown): Meta {
  const m = rec(raw);
  const suites = arr(m.suites)
    .map(rec)
    .filter((s) => typeof s.id === 'string')
    .map((s) => ({
      id: s.id as Meta['current_suite'],
      version: nstr(s.version),
      label: str(s.label, str(s.id)),
      status: nstr(s.status),
      cut_at: nstr(s.cut_at),
    }));
  return {
    site_data_format: num(m.site_data_format, 1),
    built_at: str(m.built_at),
    crucible_version: str(m.crucible_version),
    bundle_hash: str(m.bundle_hash),
    current_suite: (str(m.current_suite) || suites[0]?.id || '') as Meta['current_suite'],
    suites,
  };
}

/** Fill in what a missing or malformed file lacks. Unknown extra fields pass through untouched. */
export function normalizeIndex(raw: unknown): SuiteIndex {
  const r = rec(raw);
  const cat = rec(r.catalog);
  const suite = rec(cat.suite);
  const ent = rec(r.entities);
  const policy = rec(cat.scoring_policy);
  const labels = rec(cat.labels);
  const combined = rec(labels.combined);
  const stats = rec(r.setup_stats);

  const tasks = arr(cat.tasks)
    .map(rec)
    .filter((t) => typeof t.id === 'string')
    .map((t) => ({
      ...t,
      name: nstr(t.name),
      aliases: arr(t.aliases).filter((a): a is string => typeof a === 'string'),
      mode: nstr(t.mode),
      area: nstr(t.area),
      category: nstr(t.category),
      tier: nstr(t.tier),
      status: nstr(t.status),
      weight: typeof t.weight === 'number' ? t.weight : null,
      scoring: rec(t.scoring),
    }));

  const catalog = {
    ...cat,
    suite: {
      ...suite,
      id: str(suite.id, str(r.suite)),
      name: str(suite.name, str(suite.id, str(r.suite))),
      version: nstr(suite.version),
      cut_at: nstr(suite.cut_at),
      status: nstr(suite.status),
      changelog_url: nstr(suite.changelog_url),
    },
    modes: arr(cat.modes)
      .map(rec)
      .filter((m) => typeof m.id === 'string')
      .map((m, i) => ({
        ...m,
        label: str(m.label, str(m.id)),
        blurb: str(m.blurb),
        order: num(m.order, 1000 + i),
        areas: arr(m.areas).filter((a): a is string => typeof a === 'string'),
        harnesses: arr(m.harnesses).filter((a): a is string => typeof a === 'string'),
      })),
    areas: arr(cat.areas).map(rec).filter((a) => typeof a.id === 'string'),
    categories: arr(cat.categories).map(rec).filter((c) => typeof c.id === 'string'),
    tiers: arr(cat.tiers)
      .map(rec)
      .filter((t) => typeof t.id === 'string')
      .map((t, i) => ({
        ...t,
        label: str(t.label, str(t.id)),
        blurb: str(t.blurb),
        detail: str(t.detail),
        role: nstr(t.role),
        gate: t.gate && typeof t.gate === 'object' ? t.gate : null,
        order: num(t.order, 1000 + i),
      })),
    harnesses: arr(cat.harnesses)
      .map(rec)
      .filter((h) => typeof h.id === 'string')
      .map((h) => ({ ...h, label: str(h.label, str(h.id)), modes: arr(h.modes).filter((a): a is string => typeof a === 'string') })),
    scoring_policy: { ...policy, coverage_min: num(policy.coverage_min, 0.75), in_progress_below: num(policy.in_progress_below, 0.75) },
    scoring_methods: rec(cat.scoring_methods),
    labels: { overall: str(labels.overall, 'Overall'), combined: { label: str(combined.label, 'Combined'), blurb: str(combined.blurb) } },
    tasks,
  };

  const setups = rec(ent.setups);
  for (const k of Object.keys(setups)) {
    const s = rec(setups[k]);
    if (typeof s.id !== 'string' || typeof s.model !== 'string') {
      delete setups[k];
      continue;
    }
    setups[k] = {
      ...s,
      reasoning: str(s.reasoning, 'default'),
      harness: str(s.harness, 'unrecorded'),
      where: str(s.where, 'unrecorded'),
      maker: str(s.maker, 'unknown'),
      modes: arr(s.modes),
      labels: { model: s.model, maker: str(s.maker), packager: null, hw: null, machines: [], provider: null, ...rec(s.labels) },
      unrecorded: arr(s.unrecorded),
    };
  }

  const cells = arr(r.cells)
    .map(rec)
    .filter((c) => typeof c.setup === 'string' && typeof c.task === 'string');

  return {
    suite: str(r.suite, str(suite.id)),
    counts: rec(r.counts),
    catalog,
    entities: {
      makers: rec(ent.makers),
      models: rec(ent.models),
      artifacts: rec(ent.artifacts),
      variants: rec(ent.variants),
      deployments: rec(ent.deployments),
      setups,
    },
    cells,
    setup_stats: stats.format ? stats : { format: 'subsets', tiers: [], keys: [], by_setup: {} },
    other: rec(r.other),
  } as unknown as SuiteIndex;
}
