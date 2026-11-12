// Option counting for the shared ControlPanel (data-model §1.2, B-19). Pure.
//
// Every facet lists every value the section has, each with the count it would leave given all the *other*
// choices. A value that would leave nothing is returned `disabled` with a count of 0 (it is never dropped, so
// the panel doesn't reflow), unless it is currently picked, which can always be cleared.
//
// The count unit is the page's: the leaderboard counts leaderboard rows ("Showing 12 of 40 models"); a page
// with one model pinned counts setups, because every row would be that one model.

import type { DataContext, Dim } from './context';
import { facet, facetValue, passes, scope, setupsInView, type FacetOption, type Scope } from './scope';
import { allSetups, viewFor } from './scoring';
import { UNRECORDED } from './context';
import type { SuiteIndex } from './types';

export type CountUnit = 'rows' | 'setups';

export interface PanelOption extends FacetOption {
  /** How many `unit`s picking this value alone would leave. Same as `rows` (the unit is chosen by the caller). */
  count: number;
  selected: boolean;
  /** Would leave nothing, and isn't picked: not selectable (B-19). */
  disabled: boolean;
}

export interface PanelFacet {
  dim: Dim;
  /** Distinct values in the section whatever is picked; a panel hides a facet with fewer than two (MAIN-PANEL-16). */
  distinct: number;
  options: PanelOption[];
}

export interface PanelOpts {
  unit?: CountUnit;
  showInProgress?: boolean;
}

export function panelFacet(index: SuiteIndex, ctx: DataContext, dim: Dim, opts: PanelOpts = {}): PanelFacet {
  const picked = ctx.filters[dim];
  const base = facet(index, ctx, dim, { showInProgress: opts.showInProgress });
  let all: FacetOption[] = base.all;

  if (opts.unit === 'setups') {
    const view = viewFor(index, ctx.section, ctx.provisional);
    const inView = setupsInView(view);
    const setups = allSetups(index).filter((s) => inView.has(s.id));
    const counts = new Map<string, number>();
    for (const s of setups) {
      const v = facetValue(s, dim);
      if (v === null) continue;
      if (passes(s, ctx, view, dim)) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    all = all.map((o) => ({ ...o, rows: counts.get(o.value) ?? 0 }));
  }

  // A picked value the section doesn't have (a stale URL) still shows, so it can be cleared
  const have = new Set(all.map((o) => o.value));
  const extra: FacetOption[] = [...(picked ?? [])]
    .filter((v) => !have.has(v))
    .map((v) => ({ value: v, label: v === UNRECORDED ? 'Not recorded' : v, rows: 0 }));

  const options = [...all, ...extra].map<PanelOption>((o) => {
    const selected = picked?.has(o.value) ?? false;
    return { ...o, count: o.rows, selected, disabled: o.rows === 0 && !selected };
  });
  return { dim, distinct: base.distinct, options };
}

export interface PanelCounts {
  /** In scope now. */
  shown: number;
  /** In scope with every filter off (the exclusion and in-progress rules kept). */
  total: number;
  noun: 'models' | 'setups';
}

export function panelCounts(index: SuiteIndex, sc: Scope, unit: CountUnit = 'rows'): PanelCounts {
  if (unit === 'rows') return { shown: sc.visible.length, total: sc.totalRows, noun: 'models' };
  const view = sc.view;
  const inView = setupsInView(view);
  const total = allSetups(index).filter((s) => inView.has(s.id)).length;
  return { shown: sc.setups.length, total, noun: 'setups' };
}

/** Convenience for pages that don't already hold a scope. */
export function scopeFor(index: SuiteIndex, ctx: DataContext, showInProgress = false): Scope {
  return scope(index, ctx, { showInProgress });
}
