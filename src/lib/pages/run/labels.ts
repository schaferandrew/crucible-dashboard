// Labels for a run page from a suite index that some earlier page already loaded (never fetched for this).
import type { SuiteIndex } from '$lib/core/types';
import type { RunLabels } from './shape';

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});

export function labelsFromIndex(index: SuiteIndex | null, raw: unknown, suite: string | null): RunLabels {
  if (!index) return {};
  const run = rec(raw);
  const res = rec(run.resolution);
  const entry = rec(rec(run.suites)[suite ?? '']);
  const model = index.entities.models[String(res.model)];
  const maker = index.entities.makers[String(res.maker)];
  const dep = index.entities.deployments[String(res.deployment)];
  const task = index.catalog.tasks.find((t) => t.id === entry.task);
  return {
    model: model?.label,
    maker: maker?.label,
    hardware: dep?.hw_label ?? undefined,
    task: task?.name ?? undefined,
    methods: Object.fromEntries(Object.entries(index.catalog.scoring_methods).map(([k, v]) => [k, v.label])),
  };
}
