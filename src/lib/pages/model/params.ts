// Legacy model-page parameters (B-19). The old page had `variant=`, `deployment=` and `setup=`; the new one has
// ordinary filters. `translateModelParams` turns the ones that can be understood into filters (a setup id or a
// variant id names its quant, packager, format, reasoning, harness and, for a setup, its deployment) and drops
// `setup`, so the URL the page then writes is the canonical one. Anything it can't resolve is ignored.

import { UNRECORDED, type DataContext, type Dim } from '$lib/core/context';
import { facetValue } from '$lib/core/scope';
import type { Setup, SuiteIndex } from '$lib/core/types';
import { varyingDims } from './shape';

const queryOf = (search: string) => new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

/** Filters that name one setup (or just its variant). Only the dimensions the model's variants differ in. */
function filtersOf(
  index: SuiteIndex,
  model: string,
  s: Setup,
  withDeployment: boolean,
): Record<string, Set<string>> {
  const mine = Object.values(index.entities.setups).filter((x) => x.model === model);
  const dims: Dim[] = varyingDims(mine, false);
  const out: Record<string, Set<string>> = {};
  for (const d of dims) {
    const v = facetValue(s, d);
    if (v !== null) out[d] = new Set([v]);
  }
  if (s.where !== 'local' && mine.some((x) => x.where === 'local')) out.where = new Set([s.where]);
  if (withDeployment && s.deployment !== UNRECORDED) out.deployment = new Set([s.deployment]);
  return out;
}

/**
 * The context after reading `setup=<setup id>` (carried in `ctx.focus`) and `variant=<variant id>` (in `search`).
 * An explicit filter in the URL wins over what a legacy param implies. Returns `ctx` itself when nothing applies.
 */
export function translateModelParams(
  index: SuiteIndex,
  model: string,
  ctx: DataContext,
  search: string,
): DataContext {
  const q = queryOf(search);
  const variantId = q.get('variant');
  const setup = ctx.focus ? index.entities.setups[ctx.focus] : undefined;
  const variant = variantId
    ? Object.values(index.entities.setups).find((s) => s.variant === variantId)
    : undefined;
  if (!ctx.focus && !variant) return ctx;

  const implied: Record<string, Set<string>> = {
    ...(variant ? filtersOf(index, model, variant, false) : {}),
    ...(setup && setup.model === model ? filtersOf(index, model, setup, true) : {}),
  };
  const filters = {
    ...implied,
    ...Object.fromEntries(Object.entries(ctx.filters).filter(([, s]) => s && s.size)),
  };
  return { ...ctx, filters, focus: undefined };
}
