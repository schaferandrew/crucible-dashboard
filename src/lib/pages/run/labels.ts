// Task and scoring-method labels for a run page from a suite index that some earlier page already loaded (never
// fetched for this). Everything else the page shows comes from the run file's own `labels`.
import type { SuiteIndex } from '$lib/core/types';
import type { RunLabels } from './shape';

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});

export function labelsFromIndex(index: SuiteIndex | null, raw: unknown, suite: string | null): RunLabels {
  if (!index) return {};
  const entry = rec(rec(rec(raw).suites)[suite ?? '']);
  const task = index.catalog.tasks.find((t) => t.id === entry.task);
  return {
    task: task?.name ?? undefined,
    methods: Object.fromEntries(Object.entries(index.catalog.scoring_methods).map(([k, v]) => [k, v.label])),
  };
}
