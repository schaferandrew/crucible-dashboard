// The expected differences between the typed core and golden-numbers.json (the old page's numbers).
// Every allowed difference matches exactly one rule below, and every rule says why. A difference that
// matches no rule fails the parity test. The same rules are written to docs/rewrite/golden-diff.md.

import type { Diff } from './golden';

/** Models whose legacy setups changed identity (B-03: no fuzzy merge). Source: phase 2b report, "B-03" table. */
export const B03_MODELS: Record<string, string> = {
  'openai/gpt-oss-20b':
    'the registry groups runs by resolved reasoning level (r-low, r-high); the page kept requested `default` and requested `low` apart and merged runs missing a resolved level. Row `openai/gpt-oss-20b#low` differs.',
  'qwen/qwen3.5-9b':
    'q4_k_m runs record no packager, and four have no hardware key and no host that resolves, so they are `unrecorded` setups (packager, hw) instead of being absorbed into a better-recorded group. Row `qwen/qwen3.5-9b#default` differs.',
  'qwen/qwen3.6-35b-a3b':
    'one pi run (and eleven opencode runs) recorded no weights (packager, format, quant) and are their own `unrecorded` setups. Row `qwen/qwen3.6-35b-a3b#on` differs.',
  'qwen/qwen3.8-27b':
    'runs on the m5/m1 pi setups recorded no weights and are their own `unrecorded` setups. Row `qwen/qwen3.8-27b#xhigh` differs.',
};

/** Local setups served by Eclipse recorded no hardware key, so the page showed no cost; the registry fills it in. */
export const ECLIPSE_COST_MODELS: Record<string, string> = {
  'essentialai/rnj-1': 'q4_k_m served by Eclipse',
  'liquid/lfm2-24b-a2b': 'mlx 6bit direct and pi served by Eclipse',
};

/** Models whose row label changed case (registry lowercase), which moves ties that the page broke by label. */
export const ALIAS_CASE_MODELS: Record<string, string> = {
  'ornith-ai/ornith-1.5-9b': 'was Ornith-1.5-9B',
  'ornith-ai/ornith-1.5-35b-a3b': 'was Ornith-1.5-35B-A3B',
};

export interface Rule {
  id: string;
  title: string;
  reason: string;
  match(d: Diff): boolean;
}

const modelOf = (row: string) => row.replace(/#.*$/, '').toLowerCase();
const isB03 = (row: string) => modelOf(row) in B03_MODELS;
const num = (v: unknown): v is number => typeof v === 'number';

export const RULES: Rule[] = [
  {
    id: 'B-03',
    title: 'Setups that no longer merge (B-03)',
    reason:
      'The page fuzzy-merged setups with unrecorded fields into a better-recorded group; the registry-based identity does not. Rows of these models show a different best setup or different pooled numbers. Models and causes are listed in the table below.',
    match: (d) =>
      d.field !== 'rank' && d.field !== 'counts.ranked' && d.field !== 'case-alias' && isB03(d.row),
  },
  {
    id: 'B-03-rank',
    title: 'Rank shifted by B-03 rows (B-07 numbering)',
    reason:
      'A row of an affected model moved (or, for the lowercased Ornith ids, sorts differently where scores tie, because the page broke ties by the case of the label), so the rows below it shifted. For an unaffected row the new rank is checked exactly: golden rank + (affected ranked rows above it now) - (affected ranked rows above it then). For an affected row the rank follows its changed score.',
    match: (d) => {
      if (d.field !== 'rank') return false;
      if (isB03(d.row) || modelOf(d.row) in ECLIPSE_COST_MODELS || modelOf(d.row) in ALIAS_CASE_MODELS)
        return true;
      const exp = (d.note as { expectedRank?: number } | undefined)?.expectedRank;
      return num(exp) && exp === d.actual;
    },
  },
  {
    id: 'B-03-count',
    title: 'Ranked-row count changed by B-03 rows',
    reason:
      'A row of an affected model became partial or in-progress (or moved out of the ranked set), changing how many rows are ranked. The difference is at most the number of affected rows in the scenario.',
    match: (d) =>
      (d.field === 'counts.ranked' || d.field === 'counts.rowsShown' || d.field === 'facet.rows') &&
      (d.note as { affected?: number } | undefined)?.affected !== undefined &&
      Math.abs((d.golden as number) - ((d.actual as number) ?? 0)) <=
        (d.note as { affected: number }).affected,
  },
  {
    id: 'eclipse-cost',
    title: 'Eclipse cost filled in',
    reason:
      'These setups were served by Eclipse and recorded no hardware key, so the page showed no cost. The registry maps Eclipse to m5-pro-48gb, so they now have a small electricity cost (the doc says about 2e-5 to 5e-5 USD).',
    match: (d) =>
      d.field === 'cost' &&
      (d.golden === null || d.golden === undefined) &&
      num(d.actual) &&
      d.actual > 0 &&
      d.actual < 1e-3 &&
      modelOf(d.row) in ECLIPSE_COST_MODELS,
  },
  {
    id: 'eclipse-hw',
    title: 'Eclipse hardware filled in',
    reason:
      'Those Eclipse-served setups recorded no hardware key, so the page listed them under hardware "not recorded". The registry fills m5-pro-48gb, so under a hardware filter they leave the "not recorded" board and join the m5-pro-48gb one.',
    match: (d) =>
      (d.field === 'row-missing' || d.field === 'row-extra') &&
      d.scenario.includes('|filter hw=') &&
      modelOf(d.row) in ECLIPSE_COST_MODELS,
  },
  {
    id: 'case-alias',
    title: 'Model id lowercased by the registry',
    reason:
      'The page keyed rows by the raw base string (Ornith-1.5-9B); the registry resolves it to the lowercase canonical model id. The rows are matched by model and reasoning level, ignoring case, and their numbers are compared as usual.',
    match: (d) => d.field === 'case-alias',
  },
];

export function classify(d: Diff): Rule | null {
  return RULES.find((r) => r.match(d)) ?? null;
}
