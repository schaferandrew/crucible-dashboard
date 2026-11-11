// The expected differences between the typed core and golden-numbers.json (the old page's numbers).
// Every allowed difference matches exactly one rule below, and every rule says why. A difference that
// matches no rule fails the parity test. The same rules are written to docs/rewrite/golden-diff.md.

import type { Diff } from './golden';

/** Models whose legacy setups changed identity (B-03: no fuzzy merge). Source: phase 2b report, "B-03" table. */
export const B03_MODELS: Record<string, string> = {
  'google/gemma-4-26b-a4b-qat':
    'direct and pi on Whitehall: packager and resolved reasoning level were not recorded on 31+20 runs, so the page merged them into the better-recorded group; they are now two setups (r-default and r-on).',
  'google/gemma-4-e4b':
    'direct and pi on Ironwood (mlx 4bit): 21+23 runs recorded no packager or resolved level and used to merge with the recorded ones; now r-default and r-on setups.',
  'openai/gpt-oss-20b':
    'direct and pi on Whitehall (mxfp4): packager, format and resolved level missing on some runs (three setups); and the registry level `low` joins what the page kept apart as requested default and requested low.',
  'ornith-ai/ornith-1.5-9b':
    'q6_k direct split by resolved level (r-on vs r-default); one q4_k_m run recorded no weights (packager, format, quant) and is its own `unrecorded` setup. Also the row key is lowercased by the registry alias (was Ornith-1.5-9B).',
  'ornith-ai/ornith-1.5-35b-a3b':
    'one q4_k_s run recorded no weights and is its own `unrecorded` setup. Also the row key is lowercased by the registry alias (was Ornith-1.5-35B-A3B).',
  'qwen/qwen3.5-35b-a3b': 'one q6_k run recorded no weights and is its own `unrecorded` setup.',
  'qwen/qwen3.6-35b-a3b':
    'one q4_k_m pi run recorded no weights (and no level) and is its own `unrecorded` setup.',
  'qwen/qwen3.8-27b': 'one mlx 4bit pi run recorded no weights and is its own `unrecorded` setup.',
  'qwen/qwen3.5-9b':
    'four q4_k_m runs have no hardware key and no host that resolves, so they sit on `local~unrecorded` instead of being absorbed.',
};

/** Local setups served by Eclipse recorded no hardware key, so the page showed no cost; the registry fills it in. */
export const ECLIPSE_COST_MODELS: Record<string, string> = {
  'essentialai/rnj-1': 'q4_k_m served by Eclipse',
  'liquid/lfm2-24b-a2b': 'mlx 6bit direct and pi served by Eclipse',
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
    id: 'combined-pooled',
    title: 'Combined time, tok/s and cost pooled from two setups',
    reason:
      "The page's Combined row takes one median over the runs of both paired setups. site-data gives a median per setup, which cannot be pooled exactly, so the core estimates it from the two setups' values (weighted by run count) and flags the row `approx`. The estimate lies between the two setups' own values, and so does the golden number; the test checks that. Exact pooling needs per-run values in the site data (see the Phase 3 report).",
    match: (d) =>
      (d.field === 'time' || d.field === 'tps' || d.field === 'cost') &&
      !!(d.note as { approx?: boolean } | undefined)?.approx &&
      !!(d.note as { withinBounds?: boolean } | undefined)?.withinBounds,
  },
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
      'A row of an affected model moved, so the rows below it shifted. For an unaffected row the new rank is checked exactly: golden rank + (affected ranked rows above it now) - (affected ranked rows above it then). For an affected row the rank follows its changed score.',
    match: (d) => {
      if (d.field !== 'rank') return false;
      if (isB03(d.row) || modelOf(d.row) in ECLIPSE_COST_MODELS) return true;
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
