// Shared by the parity tests: loads the real site-data and golden-numbers.json, reproduces the golden
// leaderboard scenarios with the typed core, and returns every difference found.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeIndex, normalizeMeta } from '../src/lib/core/normalize';
import { defaultContext, type DataContext, type Dim } from '../src/lib/core/context';
import { facet, scope } from '../src/lib/core/scope';
import { OVERALL, isRanked, sortRows, type Row } from '../src/lib/core/scoring';
import { COMBINED, asSectionId, asSuiteId, asTierId, type SuiteIndex } from '../src/lib/core/types';
import { ALIAS_CASE_MODELS, B03_MODELS, ECLIPSE_COST_MODELS } from './allowlist';

export const ROOT = resolve(import.meta.dirname, '..');
export const DATA_DIR = resolve(ROOT, 'static/data');

export function haveData(): boolean {
  return existsSync(resolve(DATA_DIR, 'meta.json'));
}

export function loadMeta() {
  return normalizeMeta(JSON.parse(readFileSync(resolve(DATA_DIR, 'meta.json'), 'utf8')));
}

export function loadIndex(suite: string): SuiteIndex {
  return normalizeIndex(JSON.parse(readFileSync(resolve(DATA_DIR, suite, 'index.json'), 'utf8')));
}

// The golden file is large and untyped; this is the one place that reads it loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export function loadGolden(): Json {
  return JSON.parse(readFileSync(resolve(ROOT, 'docs/rewrite/golden-numbers.json'), 'utf8'));
}

export interface Diff {
  suite: string;
  mode: string;
  scenario: string;
  /** The golden row key (base#level), or the new row key for extra rows. */
  row: string;
  /** What differs: `row-missing`, `row-extra`, or a field path such as `overall.score`. */
  field: string;
  golden: unknown;
  actual: unknown;
  /** Extra facts the allowlist rules match on. */
  note?: Record<string, unknown>;
}

const TOL = 1e-5;
function same(g: unknown, a: unknown): boolean {
  if (typeof g === 'number' && typeof a === 'number') return Math.abs(g - a) <= TOL + TOL * Math.abs(g);
  if (g === undefined || g === null) return a === undefined || a === null;
  return JSON.stringify(g) === JSON.stringify(a);
}

export function ctxFor(
  index: SuiteIndex,
  section: string,
  provisional: boolean,
  exclude: string[],
  filters: DataContext['filters'] = {},
): DataContext {
  const base = defaultContext({ currentSuite: asSuiteId(index.suite), suites: [asSuiteId(index.suite)] });
  return {
    ...base,
    section: asSectionId(section),
    provisional,
    exclude: new Set(exclude.map(asTierId)),
    filters,
  };
}

const modelOf = (row: string) => row.replace(/#.*$/, '').toLowerCase();
/** Rows whose numbers or membership legitimately moved (B-03 splits, Eclipse hardware filled in). */
export const isAffected = (row: string) =>
  modelOf(row) in B03_MODELS || modelOf(row) in ECLIPSE_COST_MODELS || modelOf(row) in ALIAS_CASE_MODELS;

interface Brief {
  score: number | null;
  max?: number;
  coverage: number;
  scored: number;
  total: number;
  min: number | null;
  partial: boolean;
}

/** Compare one scenario's rows with the golden rows (both in displayed order). */
export function compareRows(
  meta: { suite: string; mode: string; scenario: string },
  goldenRows: Json[],
  actual: Row[],
  rank: Map<string, number>,
  opts: { detail: boolean; goldenMode: string },
): Diff[] {
  const diffs: Diff[] = [];
  const byLower = new Map(actual.map((r) => [r.rowKey.toLowerCase(), r]));
  const used = new Set<string>();
  const push = (row: string, field: string, golden: unknown, a: unknown, note?: Record<string, unknown>) =>
    diffs.push({ ...meta, row, field, golden, actual: a, note });

  // For the rank rule: where each row sits in each ordering
  const goldenIndex = new Map(goldenRows.map((g, i) => [g.rowKey.toLowerCase(), i]));
  const actualIndex = new Map(actual.map((r, i) => [r.rowKey.toLowerCase(), i]));
  const goldenAffectedRanked = goldenRows
    .map((g, i) => ({ i, k: g.rowKey, ranked: g.rank !== null && isAffected(g.rowKey) }))
    .filter((x) => x.ranked);
  const actualAffectedRanked = actual
    .map((r, i) => ({ i, ranked: rank.has(r.rowKey) && isAffected(r.rowKey) }))
    .filter((x) => x.ranked);

  for (const g of goldenRows) {
    const r = byLower.get(g.rowKey.toLowerCase());
    if (!r) {
      push(g.rowKey, 'row-missing', g.overall?.score ?? null, null, { label: g.label, rank: g.rank });
      continue;
    }
    used.add(r.rowKey.toLowerCase());
    if (r.rowKey !== g.rowKey) push(g.rowKey, 'case-alias', g.rowKey, r.rowKey);
    const check = (field: string, gv: unknown, av: unknown, note?: Record<string, unknown>) => {
      if (!same(gv, av)) push(g.rowKey, field, gv, av, note);
    };
    const gi = goldenIndex.get(g.rowKey.toLowerCase())!;
    const ai = actualIndex.get(r.rowKey.toLowerCase())!;
    const expectedRank =
      g.rank === null
        ? null
        : g.rank +
          actualAffectedRanked.filter((x) => x.i < ai).length -
          goldenAffectedRanked.filter((x) => x.i < gi).length;
    check('rank', g.rank, rank.get(r.rowKey) ?? null, { expectedRank });
    check('inProgress', g.inProgress, r.inProgress);
    const go: Brief | undefined = g.overall;
    const ao: Brief = r.overall;
    for (const f of ['score', 'max', 'coverage', 'scored', 'total', 'min', 'partial'] as const)
      check(`overall.${f}`, go?.[f], ao[f]);
    for (const [tier, gt] of Object.entries<Json>(g.tier ?? {})) {
      const at: Brief | null = r.tier[tier] ?? null;
      if (!gt) {
        check(`tier.${tier}`, null, at ? at.score : null);
        continue;
      }
      if (!at) {
        push(g.rowKey, `tier.${tier}`, gt.score, null);
        continue;
      }
      for (const f of ['score', 'coverage', 'scored', 'total', 'min', 'partial'] as const)
        check(`tier.${tier}.${f}`, gt[f], at[f]);
      if (opts.goldenMode === 'combined') check(`tier.${tier}.max`, gt.max, at.max);
    }
    if (!opts.detail) continue;
    check('ran', g.ran, r.ran);
    check('runs', g.runs, r.runs);
    check('progress.done', g.progress?.done, r.progress.done);
    check('progress.total', g.progress?.total, r.progress.total);
    for (const [tier, v] of Object.entries<Json>(g.verdict ?? {}))
      check(`verdict.${tier}`, v, r.verdict[tier] ?? null);
    if (g.provisionalRan) {
      check('provisionalRan.done', g.provisionalRan.done, r.provisionalRan?.done);
      check('provisionalRan.total', g.provisionalRan.total, r.provisionalRan?.total);
    }
    check('time', g.time, r.time);
    check('tps', g.tps, r.tps);
    check('cost', g.cost, r.cost);
  }
  for (const r of actual)
    if (!used.has(r.rowKey.toLowerCase()))
      push(r.rowKey, 'row-extra', null, r.overall.score, { label: r.label });
  return diffs;
}

export interface ScenarioRun {
  suite: string;
  mode: string;
  scenarioId: string;
  rowsGolden: number;
  rowsActual: number;
  diffs: Diff[];
}

const affectedIn = (rows: Json[]) => rows.filter((g) => isAffected(g.rowKey)).length;

/** Run every golden scenario (mode x provisional x exclusion x in-progress) through the typed core. */
export function runScenarios(): ScenarioRun[] {
  const golden = loadGolden();
  const out: ScenarioRun[] = [];
  for (const sid of ['v4', 'v3']) {
    const index = loadIndex(sid);
    const gs = golden.suites[sid];
    for (const [mode, gm] of Object.entries<Json>(gs.modes)) {
      const section = mode === 'combined' ? COMBINED : mode;
      for (const sc of gm.scenarios) {
        if (sc.error) continue;
        const ctx = ctxFor(index, section, sc.provisional, sc.exclude);
        const s = scope(index, ctx, { showInProgress: sc.showInProgress });
        const rows = s.visible;
        const diffs = compareRows({ suite: sid, mode, scenario: sc.id }, sc.rows, rows, s.rank, {
          detail: !sc.exclude.length,
          goldenMode: mode,
        });
        const ranked = rows.filter(isRanked).length;
        if (sc.counts.ranked !== ranked) {
          diffs.push({
            suite: sid,
            mode,
            scenario: sc.id,
            row: '(board)',
            field: 'counts.ranked',
            golden: sc.counts.ranked,
            actual: ranked,
            note: { affected: affectedIn(sc.rows) + rows.filter((r) => isAffected(r.rowKey)).length },
          });
        }
        if (sc.counts.rowsShown !== rows.length) {
          diffs.push({
            suite: sid,
            mode,
            scenario: sc.id,
            row: '(board)',
            field: 'counts.rowsShown',
            golden: sc.counts.rowsShown,
            actual: rows.length,
            note: { affected: affectedIn(sc.rows) + rows.filter((r) => isAffected(r.rowKey)).length },
          });
        }
        out.push({
          suite: sid,
          mode,
          scenarioId: sc.id,
          rowsGolden: sc.rows.length,
          rowsActual: rows.length,
          diffs,
        });

        // sort orders (base scenario only): the relative order of unaffected rows must match
        if (sc.sortOrders) {
          for (const [key, so] of Object.entries<Json>(sc.sortOrders)) {
            if (so.error) continue;
            const gOrder: string[] = so.rowKeys
              .map((k: string) => k.toLowerCase())
              .filter((k: string) => !isAffected(k));
            const sorted = sortRows(index, rows, { key: key === 'overall' ? OVERALL : key, dir: so.dir });
            // rows with no value for the column sit in label order now (the old comparator left them to the sort algorithm)
            const valueOf = (r: Row): unknown =>
              key === 'model'
                ? 1
                : key === 'time'
                  ? r.time
                  : key === 'tps'
                    ? r.tps
                    : key === 'cost'
                      ? r.cost
                      : key === 'overall'
                        ? r.overall.score
                        : r.tier[key]?.score;
            const hasValue = new Set(
              sorted
                .filter((r) => valueOf(r) !== null && valueOf(r) !== undefined)
                .map((r) => r.rowKey.toLowerCase()),
            );
            const present = new Set(gOrder.filter((k: string) => hasValue.has(k)));
            const aOrder = sorted
              .map((r) => r.rowKey.toLowerCase())
              .filter((k) => !isAffected(k) && present.has(k));
            const gCommon = gOrder.filter((k) => aOrder.includes(k));
            if (JSON.stringify(gCommon) !== JSON.stringify(aOrder)) {
              out[out.length - 1]!.diffs.push({
                suite: sid,
                mode,
                scenario: sc.id,
                row: `(sort ${key})`,
                field: 'sortOrder',
                golden: gCommon.slice(0, 8),
                actual: aOrder.slice(0, 8),
              });
            }
          }
        }
        // single-filter boards (base scenario only)
        if (sc.singleFilterBoards) {
          for (const [label, board] of Object.entries<Json>(sc.singleFilterBoards)) {
            const [dim, ...rest] = label.split('=');
            const value = rest.join('=') === '-' ? 'unrecorded' : rest.join('=');
            if (!['harness', 'where', 'hw', 'reasoning'].includes(dim!)) continue; // format/quant/packager values changed grammar
            if (dim === 'harness' && mode === 'combined') continue; // B-08: no harness filter in Combined
            const fctx = ctxFor(index, section, false, [], { [dim as Dim]: new Set([value]) });
            const fs = scope(index, fctx, { showInProgress: sc.showInProgress });
            const goldenRows = board.rows.map(([rowKey, rank, score]: [string, number | null, number]) => ({
              rowKey,
              rank,
              overall: { score },
            }));
            const d = compareRows(
              { suite: sid, mode, scenario: `${sc.id}|filter ${label}` },
              goldenRows,
              fs.visible,
              fs.rank,
              { detail: false, goldenMode: mode },
            );
            // a compact golden row has no tier data
            out[out.length - 1]!.diffs.push(
              ...d.filter(
                (x) => x.field === 'rank' || x.field === 'overall.score' || x.field.startsWith('row-'),
              ),
            );
            if (board.count !== fs.visible.length) {
              out[out.length - 1]!.diffs.push({
                suite: sid,
                mode,
                scenario: `${sc.id}|filter ${label}`,
                row: '(board)',
                field: 'counts.rowsShown',
                golden: board.count,
                actual: fs.visible.length,
                note: {
                  affected: affectedIn(goldenRows) + fs.visible.filter((r) => isAffected(r.rowKey)).length,
                },
              });
            }
          }
        }
        // facet option row counts for dims whose values map one-to-one (base scenario only)
        if (sc.filterOptions) {
          for (const dim of (mode === 'combined' ? ['where'] : ['where', 'harness']) as (
            'where' | 'harness'
          )[]) {
            const gOpts: [string, number][] = sc.filterOptions[dim] ?? [];
            const f = facet(index, ctx, dim, { showInProgress: sc.showInProgress });
            const aOpts = new Map(f.options.map((o) => [o.value, o.rows]));
            for (const [v, n] of gOpts) {
              if (aOpts.get(v) !== n)
                diffs.push({
                  suite: sid,
                  mode,
                  scenario: sc.id,
                  row: `(facet ${dim}=${v})`,
                  field: 'facet.rows',
                  golden: n,
                  actual: aOpts.get(v) ?? null,
                  note: { affected: affectedIn(sc.rows) + rows.filter((r) => isAffected(r.rowKey)).length },
                });
            }
          }
        }
      }
    }
  }
  return out;
}
