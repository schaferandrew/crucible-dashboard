// The takeaways above the leaderboard (MAIN-TAKE-01..08): a few sentences from the *counted* default view
// (filters and tier exclusion respected, provisional tasks never). Parts are text or a model reference the
// component links to its page.

import { fmtScore, fmtUsd, listPhrase } from '$lib/core/format';
import { isRanked, type Row } from '$lib/core/scoring';
import type { Scope } from '$lib/core/scope';
import type { SuiteIndex } from '$lib/core/types';
import { setupLabel } from '$lib/labels';
import { aggLabel, filterPhrase } from './phrases';

export type Part = string | { model: string; text: string };

const ref = (r: Row): Part => ({ model: r.model, text: r.label });

export function takeaways(index: SuiteIndex, sc: Scope): Part[][] {
  const { view, ctx } = sc;
  const combined = view.kind === 'combined';
  const phrase = filterPhrase(index, ctx, view);
  const tail = phrase ? ' ' + phrase : '';
  const label = aggLabel(view);
  const ranked = sc.rows.filter((r) => isRanked(r)).sort((a, b) => b.overall.score! - a.overall.score!);
  const lines: Part[][] = [];
  if (ranked.length) {
    const top = ranked.slice(0, 2);
    const what = view.showAgg
      ? 'on ' + listPhrase(view.aggTiers(ctx.exclude).map((t) => t.label)) + ' together'
      : `the ${label} tasks`;
    lines.push(
      top.length > 1
        ? [ref(top[0]!), ' and ', ref(top[1]!), ` lead ${what}${tail}.`]
        : [ref(top[0]!), ` leads ${what}${tail}.`],
    );
    const local = ranked.find((r) => r.local);
    const where = ctx.filters.where;
    if (local && !(where?.size === 1 && where.has('cloud'))) {
      lines.push([
        'The best local model is ',
        ref(local),
        ` at ${fmtScore(local.overall.score)}${combined ? ' of ' + local.overall.max : ''}, on ${setupLabel(local)}.`,
      ]);
    }
    const priced = ranked.filter((r) => !r.local && r.cost);
    if (priced.length > 1) {
      const value = priced
        .slice()
        .sort((a, b) => b.overall.score! / b.cost! - a.overall.score! / a.cost!)[0]!;
      lines.push([ref(value), ` gives the most ${label} score per dollar (${fmtUsd(value.cost)} per task).`]);
    }
  }
  const stretch = view.tiers.find((t) => t.role === 'stretch');
  if (stretch) {
    const counted = (r: Row) => {
      const t = r.tier[stretch.id];
      return t && t.score !== null && !t.partial ? t.score : null;
    };
    const best = sc.rows.filter((r) => counted(r) !== null).sort((a, b) => counted(b)! - counted(a)!)[0];
    if (best)
      lines.push([
        ref(best),
        ` scores highest on the ${stretch.label} tasks (${fmtScore(counted(best))}${combined ? ' of ' + view.tierMax(stretch.id) : ''}).`,
      ]);
  }
  if (!lines.length)
    lines.push([`No model has a complete ${label} score${phrase ? ' ' + phrase : ' in this section'} yet.`]);
  return lines;
}
