// A tiny synthetic suite for unit tests that must not depend on the generated data.
// Two sections (chat, agentic), two tiers (spark gate, temper headline), three setups of one model.

import { normalizeIndex } from '../src/lib/core/normalize';

type Block = {
  n: number;
  n_scored: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  n_finished: number;
  mean_finished: number | null;
  timeouts: number;
  errors: number;
};
const block = (mean: number): Block => ({
  n: 1,
  n_scored: 1,
  mean,
  min: mean,
  max: mean,
  n_finished: 1,
  mean_finished: mean,
  timeouts: 0,
  errors: 0,
});

const setup = (id: string, harness: string, extra: Record<string, unknown> = {}) => ({
  id,
  variant: id,
  artifact: 'm/a~api',
  deployment: 'cloud~openrouter',
  model: 'm/a',
  maker: 'm',
  packager: null,
  format: null,
  quant: null,
  reasoning: 'default',
  harness,
  where: 'cloud',
  hw: null,
  provider: 'openrouter',
  modes: [],
  runs: 1,
  labels: { model: 'a', maker: 'M', packager: null, hw: null, machines: [], provider: 'openrouter' },
  unrecorded: [],
  ...extra,
});

export function syntheticIndex() {
  const tasks = [
    { id: 'c1', mode: 'chat', area: 'x', category: 'k', tier: 'spark', status: 'active', weight: 0.5 },
    { id: 'c2', mode: 'chat', area: 'x', category: 'k', tier: 'temper', status: 'active', weight: 0.5 },
    { id: 'a1', mode: 'agentic', area: 'y', category: 'k', tier: 'spark', status: 'active', weight: 0.5 },
    { id: 'a2', mode: 'agentic', area: 'y', category: 'k', tier: 'temper', status: 'active', weight: 0.5 },
    { id: 'p1', mode: 'chat', area: 'x', category: 'k', tier: 'temper', status: 'provisional', weight: null },
  ];
  const cell = (s: string, t: string, mean: number) => ({ setup: s, task: t, runs: 1, counted: block(mean) });
  const raw = {
    suite: 's',
    catalog: {
      suite: { id: 's', name: 'Suite s' },
      modes: [
        { id: 'chat', label: 'Chat', order: 1, areas: ['x'], harnesses: ['direct'] },
        { id: 'agentic', label: 'Agentic', order: 2, areas: ['y'], harnesses: ['pi'] },
      ],
      areas: [],
      categories: [],
      tiers: [
        { id: 'spark', label: 'Spark', order: 1, role: 'gate', gate: { mean: 8, min: 5 } },
        { id: 'temper', label: 'Temper', order: 2, role: 'headline' },
      ],
      harnesses: [],
      scoring_policy: { coverage_min: 0.75, in_progress_below: 0.75 },
      labels: { overall: 'Overall', combined: { label: 'Combined', blurb: '' } },
      tasks: tasks.map((t) => ({ ...t, name: t.id, aliases: [], scoring: {} })),
    },
    entities: {
      models: { 'm/a': { id: 'm/a', label: 'a', maker: 'm', known: true } },
      setups: Object.fromEntries(
        [
          setup('s-chat', 'direct'),
          setup('s-pi', 'pi'),
          setup('s-other', 'pi', { reasoning: 'high', artifact: 'm/a~api~high' }),
        ].map((s) => [s.id, s]),
      ),
    },
    cells: [
      cell('s-chat', 'c1', 10),
      cell('s-chat', 'c2', 8),
      { setup: 's-chat', task: 'p1', runs: 1, provisional: block(6) },
      cell('s-pi', 'a1', 9),
      cell('s-pi', 'a2', 7),
      cell('s-other', 'a1', 4),
    ],
    setup_stats: { format: 'subsets', tiers: ['spark', 'temper'], keys: [], by_setup: {} },
    other: {},
  };
  return normalizeIndex(raw);
}
