// scope(index, ctx): the setups, cells and leaderboard rows a DataContext puts in view.
//
// Filters drill down, they never gate the first view: with no filters the scope is everything. Filters
// narrow *setups* before each row's best setup is chosen, so a row shows its best matching setup or drops
// out. Within one dimension values are OR, across dimensions AND. A setup whose value is not applicable
// (null, e.g. a cloud setup's quant) never matches a non-empty pick of that dimension.

import { suiteInfo } from './catalog';
import { DIMS, UNRECORDED, type DataContext, type Dim } from './context';
import { cap } from './format';
import {
  allSetups,
  buildRows,
  cellsOf,
  rankRows,
  sortRows,
  viewFor,
  visibleRows,
  OVERALL,
  type Candidate,
  type Row,
  type SortSpec,
  type View,
} from './scoring';
import type { Cell, Setup, SuiteIndex, TierId } from './types';
import { COMBINED } from './types';

/** A setup's value on a filter dimension: a string, `unrecorded`, or null when not applicable. */
export function facetValue(s: Setup, dim: Dim): string | null {
  const v = s[dim];
  return v === undefined || v === null ? null : String(v);
}

/** Does a setup pass every filter (except `skip`)? In Combined the harness filter does not apply (B-08). */
export function passes(s: Setup, ctx: DataContext, view: View, skip?: Dim): boolean {
  for (const dim of DIMS) {
    if (dim === skip) continue;
    if (dim === 'harness' && view.kind === 'combined') continue;
    const set = ctx.filters[dim];
    if (!set || !set.size) continue;
    const v = facetValue(s, dim);
    if (v === null || !set.has(v)) return false;
  }
  return true;
}

export interface Scope {
  view: View;
  ctx: DataContext;
  /** Setups in the section that pass the filters. */
  setups: Setup[];
  /** Their cells on the section's shown tasks. */
  cells: Cell[];
  /** Leaderboard rows (best candidate per model and reasoning level), by Overall, best first. Includes in-progress rows. */
  rows: Row[];
  /** Rank by Overall of each ranked row, whatever the sort (B-07). */
  rank: Map<string, number>;
  /** The rows the board shows: in-progress rows only when asked or when no row has finished. */
  visible: Row[];
  /** Rows with the filters off (but the exclusion and in-progress rules kept): the "of M" in "Showing N of M". */
  totalRows: number;
  /** Count of in-progress rows hidden from `visible`. */
  hiddenInProgress: number;
}

export interface ScopeOptions {
  showInProgress?: boolean;
  sort?: SortSpec;
}

/** The setups of a view that appear in at least one of its candidates. */
export function setupsInView(view: View): Set<string> {
  const ids = new Set<string>();
  for (const c of view.candidates()) for (const m of c.members) if (m) ids.add(m.id);
  return ids;
}

function candidatePasses(c: Candidate, ctx: DataContext, view: View, skip?: Dim): boolean {
  // Members of a Combined candidate agree on every facet but the harness, so the first member decides
  return passes(c.first, ctx, view, skip);
}

export function scope(index: SuiteIndex, ctx: DataContext, opts: ScopeOptions = {}): Scope {
  const view = viewFor(index, ctx.section, ctx.provisional);
  const exclude = ctx.exclude as ReadonlySet<TierId>;
  const inView = setupsInView(view);
  const setups = allSetups(index).filter((s) => inView.has(s.id) && passes(s, ctx, view));

  const cells: Cell[] = [];
  for (const s of setups) {
    for (const [task, cell] of cellsOf(index, s.id)) if (view.taskIds.has(task as never)) cells.push(cell);
  }

  const rows = sortRows(
    index,
    buildRows(index, view, (c) => candidatePasses(c, ctx, view), exclude),
    {
      key: OVERALL,
      dir: -1,
    },
  );
  const rank = rankRows(index, rows);
  const show = !!opts.showInProgress;
  const visible = visibleRows(rows, show);
  const all = buildRows(index, view, undefined, exclude);
  const totalRows = visibleRows(all, show).length;
  const sorted = opts.sort ? sortRows(index, visible, opts.sort) : visible;
  return {
    view,
    ctx,
    setups,
    cells,
    rows,
    rank,
    visible: sorted,
    totalRows,
    hiddenInProgress: rows.length - visible.length,
  };
}

// ---- Facets (the filter bar) ----

export interface FacetOption {
  value: string;
  label: string;
  /** Rows left if this value alone were picked (with every other filter kept). */
  rows: number;
}

export interface Facet {
  dim: Dim;
  /** Distinct values among the section's setups, whatever is picked. A bar hides a facet with fewer than two (MAIN-PANEL-16). */
  distinct: number;
  /** Values that leave at least one row, in display order (by label, `unrecorded` last). */
  options: FacetOption[];
  /** Every value of the section, in the same order, including those that would leave no row (`rows: 0`): the panel disables these (B-19). */
  all: FacetOption[];
}

export function facetLabel(index: SuiteIndex, dim: Dim, value: string, sample?: Setup): string {
  if (value === UNRECORDED) return 'Not recorded';
  const l = sample?.labels;
  switch (dim) {
    case 'where':
      return cap(value);
    case 'hw':
      return l?.hw ?? value;
    case 'maker':
      return l?.maker ?? index.entities.makers[value]?.label ?? value;
    case 'model':
      return l?.model ?? index.entities.models[value]?.label ?? value;
    case 'packager':
      return l?.packager ?? value;
    case 'provider':
      return l?.provider ?? value;
    case 'harness':
      return index.catalog.harnesses.find((h) => h.id === value)?.label ?? value;
    case 'deployment':
      return index.entities.deployments[value]?.label ?? value;
    default:
      return value;
  }
}

/** The display text of one filter value (for chips), found from any setup that has it. */
export function facetValueLabel(index: SuiteIndex, dim: Dim, value: string): string {
  const sample = allSetups(index).find((s) => facetValue(s, dim) === value);
  return facetLabel(index, dim, value, sample);
}

/**
 * The options of one filter dimension, drill-down style: the values left by every *other* filter, each with
 * the number of rows picking it alone would leave. An option appears only if choosing it leaves at least one
 * row, so no pick empties the board.
 */
export function facet(index: SuiteIndex, ctx: DataContext, dim: Dim, opts: ScopeOptions = {}): Facet {
  const view = viewFor(index, ctx.section, ctx.provisional);
  const exclude = ctx.exclude as ReadonlySet<TierId>;
  const inView = setupsInView(view);
  const section = allSetups(index).filter((s) => inView.has(s.id));
  const distinct = new Set<string>();
  const samples = new Map<string, Setup>();
  for (const s of section) {
    const v = facetValue(s, dim);
    if (v !== null) {
      distinct.add(v);
      if (!samples.has(v)) samples.set(v, s);
    }
  }
  const all: FacetOption[] = [];
  for (const v of distinct) {
    const rows = buildRows(
      index,
      view,
      (c) => candidatePasses(c, ctx, view, dim) && facetValue(c.first, dim) === v,
      exclude,
    );
    const n = visibleRows(rows, !!opts.showInProgress).length;
    all.push({ value: v, label: facetLabel(index, dim, v, samples.get(v)), rows: n });
  }
  all.sort(
    (a, b) =>
      Number(a.value === UNRECORDED) - Number(b.value === UNRECORDED) ||
      (a.label.toLowerCase() < b.label.toLowerCase()
        ? -1
        : a.label.toLowerCase() > b.label.toLowerCase()
          ? 1
          : 0),
  );
  return { dim, distinct: distinct.size, options: all.filter((o) => o.rows > 0), all };
}

/**
 * Switch section (B-08): clear every filter value the target section doesn't have, keep the rest. The
 * harness filter does not exist in Combined, so it is cleared there.
 */
export function changeSection(index: SuiteIndex, ctx: DataContext, section: string): DataContext {
  const view = viewFor(index, section, ctx.provisional);
  const inView = setupsInView(view);
  const setups = allSetups(index).filter((s) => inView.has(s.id));
  const filters: Record<string, ReadonlySet<string>> = {};
  for (const dim of DIMS) {
    const set = ctx.filters[dim];
    if (!set || !set.size) continue;
    if (dim === 'harness' && view.kind === 'combined') continue;
    const have = new Set(setups.map((s) => facetValue(s, dim)));
    const kept = [...set].filter((v) => have.has(v));
    if (kept.length) filters[dim] = new Set(kept);
  }
  const info = suiteInfo(index.catalog);
  const known = info.modes.some((m) => m.id === section) || (section === COMBINED && info.hasCombined);
  return { ...ctx, section: (known ? section : ctx.section) as DataContext['section'], filters };
}

/** Number of rows each value of a section-level toggle (local/cloud) would show: the Models toggle. */
export function rowsWhere(
  index: SuiteIndex,
  ctx: DataContext,
  where: string | null,
  opts: ScopeOptions = {},
): number {
  const set = where ? new Set([where]) : undefined;
  const next: DataContext = { ...ctx, filters: { ...ctx.filters, where: set } };
  return scope(index, next, opts).visible.length;
}
