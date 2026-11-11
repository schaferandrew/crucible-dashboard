// The sentences the main page composes from the current view: the filter phrase, the empty-board text, the
// leaderboard note, the "How scores are made" caveat and the footnote. Pure, so they are unit-tested
// (MAIN-TAKE-07, MAIN-LB-02..05, MAIN-LB-17, MAIN-FOOT-01/02).

import type { DataContext, Dim } from '$lib/core/context';
import { fmtDate, listPhrase, NONE } from '$lib/core/format';
import type { View } from '$lib/core/scoring';
import { facetValueLabel, type Scope } from '$lib/core/scope';
import type { CatalogTask, SuiteIndex } from '$lib/core/types';

/** `a, b or c`. */
export function orList(items: string[]): string {
  return items.length > 1
    ? items.slice(0, -1).join(', ') + ' or ' + items[items.length - 1]
    : (items[0] ?? '');
}

/** "with pi run locally on M5 Pro with quant Q4_K_M at reasoning high": what the reader's filters say, in words. */
export function filterPhrase(index: SuiteIndex, ctx: DataContext, view: View): string {
  const parts: string[] = [];
  const list = (dim: Dim) => orList([...(ctx.filters[dim] ?? [])].map((v) => facetValueLabel(index, dim, v)));
  const has = (dim: Dim) => !!ctx.filters[dim]?.size;
  if (has('harness') && view.kind !== 'combined') parts.push('with ' + list('harness'));
  const where = ctx.filters.where;
  if (where?.size === 1)
    parts.push(where.has('local') ? 'run locally' : where.has('cloud') ? 'in the cloud' : '');
  if (has('hw')) parts.push('on ' + list('hw'));
  for (const dim of ['format', 'quant', 'packager'] as const)
    if (has(dim)) parts.push(`with ${dim} ${list(dim)}`);
  if (has('reasoning')) parts.push('at reasoning ' + list('reasoning'));
  for (const dim of ['model', 'maker', 'provider', 'deployment'] as const)
    if (has(dim)) parts.push(`with ${dim} ${list(dim)}`);
  return parts.filter(Boolean).join(' ');
}

/** The label of the aggregate: "Overall" when there is one, else the section's only tier. */
export function aggLabel(view: View): string {
  return view.showAgg ? view.info.overallLabel : (view.tiers[0]?.label ?? view.info.overallLabel);
}

export function emptyText(index: SuiteIndex, ctx: DataContext, view: View): string {
  const phrase = filterPhrase(index, ctx, view);
  return `No model has a counted run in ${view.kind === 'combined' ? 'any section' : 'this section'} of ${index.catalog.suite.name}${phrase ? ' ' + phrase : ''} yet.`;
}

/** The paragraph under the "Leaderboard" heading, one entry per sentence group. */
export function leaderboardNote(sc: Scope): string[] {
  const { view, ctx } = sc;
  const combined = view.kind === 'combined';
  const agg = view.aggTiers(ctx.exclude);
  const names = listPhrase(agg.map((t) => t.label));
  const parts: string[] = [];
  if (view.showAgg) {
    parts.push(
      `Ranked by ${view.info.overallLabel} score (0–${view.aggMax(ctx.exclude)}): ` +
        (combined
          ? `every section's ${names} scores added together, each out of 10, so each tier here is out of 10 per section that has it. `
          : agg.length > 1
            ? `the ${names} scores added together, each out of 10. `
            : `the ${names} score alone. `) +
        "Choose which tiers it counts in the panel above; a model missing one of them isn't ranked until you leave that tier out.",
    );
  } else {
    parts.push(`Ranked by ${aggLabel(view)} score (0–10).`);
  }
  for (const t of view.tiers) {
    const g = view.info.gateOf(t.id);
    if (g)
      parts.push(
        `${t.label} is also a pass/fail gate: a ${t.label} score of at least ${g.mean}, with no task below ${g.min}${combined ? ', in every section.' : '.'}`,
      );
  }
  if (combined)
    parts.push(
      "Each row joins one setup per section that matches on everything but the harness: model, packager, format, quant, reasoning, runtime or provider, and machine. A model missing a section isn't ranked. Time, decode speed and cost are over both setups' runs.",
    );
  parts.push(
    'Each row is one model at one reasoning level, local or cloud, scored by its single best setup (named under it); "best of N setups" lists the others. Repeat runs are averaged. Cloud providers usually serve full precision, so a row shows what a model can do, not what it does on your hardware.',
  );
  parts.push(
    `A hatched bar means fewer than ${Math.round(view.info.coverageMin * 100)}% of that tier's tasks were scored${view.showAgg ? ` (for ${view.info.overallLabel}, that one of its tiers is short)` : ''}. Select a column to sort.`,
  );
  return parts;
}

export interface Caveat {
  /** Active tasks per scoring method that has at least one scored cell, in catalog order. */
  methods: { id: string; n: number; label: string; blurb: string }[];
  /** Active tasks whose method has no scored run in this suite: left out of every score. */
  unscored: CatalogTask[];
}

/** "How scores are made" (MAIN-FOOT-01): from the catalog's tasks and which methods any cell actually scored. */
export function caveat(index: SuiteIndex): Caveat {
  const cat = index.catalog;
  const scored = new Set<string>();
  for (const c of index.cells)
    if ((c.counted?.n_scored ?? 0) > 0 || (c.provisional?.n_scored ?? 0) > 0) scored.add(c.task);
  const published = new Set<string>();
  for (const t of cat.tasks) if (scored.has(t.id) && t.scoring?.method) published.add(t.scoring.method);
  const counts = new Map<string, number>();
  const unscored: CatalogTask[] = [];
  for (const t of cat.tasks) {
    if (t.status !== 'active') continue;
    const m = t.scoring?.method || 'unknown';
    if (!published.has(m)) unscored.push(t);
    else counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const methods = [...counts].map(([id, n]) => ({
    id,
    n,
    label: cat.scoring_methods?.[id]?.label || id,
    blurb: cat.scoring_methods?.[id]?.blurb || '',
  }));
  return { methods, unscored };
}

export function caveatText(c: Caveat, suiteName: string): { lead: string; unscored: string } {
  const parts = c.methods.map((m) => `${m.n} by ${m.label}${m.blurb ? ` (${m.blurb})` : ''}`);
  const u = c.unscored;
  return {
    lead: `Every score in ${suiteName} is computed automatically, the same way every time: ${parts.join(', and ')}. Repeat runs of a setup are averaged. `,
    unscored: u.length
      ? `${u.length} task${u.length === 1 ? '' : 's'} this suite pinned ${u.length === 1 ? 'has' : 'have'} no automatic score (${u.map((t) => t.name || t.id).join(', ')}), so ${u.length === 1 ? 'it is' : 'they are'} left out of every score here. `
      : '',
  };
}

export function footnote(index: SuiteIndex, crucibleVersion: string | null): string {
  const s = index.catalog.suite;
  return (
    `${s.name}${s.cut_at ? ', cut ' + fmtDate(s.cut_at) : ''}${crucibleVersion ? '; catalog published by Crucible ' + crucibleVersion : ''}. ` +
    `${NONE} means the harness didn't report that number. Cost per task is the provider's billed cost where reported; for local runs (marked ≈) it's the electricity used, estimated from the run's time, the machine's power draw and the average US price per kWh, and leaves out the hardware itself. ` +
    `Decode speed is output tokens (reasoning included) per second of generation, leaving out prompt processing: the median over the runs that recorded it (${NONE} when none did). ` +
    "Token counts aren't comparable across harnesses. Time, decode speed and cost are each setup's own: local ones depend on the hardware named."
  );
}
