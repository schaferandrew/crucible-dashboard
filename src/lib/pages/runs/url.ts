// Page-local choices share the URL with the DataContext. Keep the context and any future params intact.
import { isSortKey, type RunFilters, type SortKey } from './shape';

export interface RunsUrl {
  filters: RunFilters;
  sort: SortKey;
}

export function parseRunsUrl(search: string): RunsUrl {
  const p = new URLSearchParams(search);
  const outcome = p.get('outcome');
  const aliases: Record<string, RunFilters['outcome']> = {
    finished: 'finished',
    completed: 'finished',
    timeout: 'timeout',
    timed_out: 'timeout',
    error: 'error',
    failed: 'error',
    harness_error: 'error',
  };
  const sort = p.get('sort');
  return {
    filters: {
      outcome: outcome && Object.hasOwn(aliases, outcome) ? aliases[outcome]! : 'all',
      state: p.get('state') || 'all',
    },
    sort: sort && isSortKey(sort) ? sort : 'newest',
  };
}

export function runsSearch(search: string, { filters, sort }: RunsUrl): string {
  const p = new URLSearchParams(search);
  for (const [key, value, fallback] of [
    ['outcome', filters.outcome, 'all'],
    ['state', filters.state, 'all'],
    ['sort', sort, 'newest'],
  ]) {
    if (value === fallback) p.delete(key!);
    else p.set(key!, value!);
  }
  return p.toString();
}
