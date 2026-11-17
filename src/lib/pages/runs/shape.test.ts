import { describe, expect, it } from 'vitest';
import { defaultContext } from '$lib/core/context';
import type { SuiteId } from '$lib/core/types';
import {
  NO_FILTERS,
  isFlagged,
  monthLabel,
  normalizeShard,
  monthsOfIndex,
  orderMonths,
  rowMatches,
  sortRuns,
  type RunRow,
} from './shape';

const row = (o: Partial<RunRow>): RunRow => ({
  id: 'x',
  startedAt: '2026-11-01T00:00:00Z',
  model: 'M',
  modelId: 'm/m',
  setup: null,
  setupId: null,
  taskId: 't',
  task: 'T',
  mode: 'chat',
  tier: null,
  outcome: 'finished',
  state: 'counted',
  flag: null,
  score: 5,
  elapsed: 1,
  cost: 0,
  local: false,
  ...o,
});
const ctx = defaultContext({ currentSuite: 'v4' as SuiteId, suites: ['v4' as SuiteId] });

describe('runs shaping (B-05, B-06)', () => {
  it('flags invalid and withdrawn, withdrawn first', () => {
    expect(isFlagged('counted', 'valid')).toBeNull();
    expect(isFlagged('invalid', 'invalid')).toBe('invalid');
    expect(isFlagged('counted', 'withdrawn')).toBe('withdrawn');
  });

  it('reads the suite state map and skips malformed runs', () => {
    const runs = normalizeShard({
      runs: [
        { run_uuid: 'a', states: { v4: { state: 'counted', task: 't', score: 7.5 } } },
        { nope: 1 },
        { run_uuid: 'b', outcome: 3, states: 5 },
      ],
    });
    expect(runs.map((r) => r.id)).toEqual(['a', 'b']);
    expect(runs[0]!.states.v4).toEqual({ state: 'counted', task: 't', score: 7.5 });
    expect(runs[1]!.states).toEqual({});
  });

  it('filters by state and outcome, and by section', () => {
    const a = row({ state: 'counted' });
    const b = row({ state: 'invalid', outcome: 'error', mode: 'agentic' });
    expect(rowMatches(a, ctx, NO_FILTERS)).toBe(true);
    expect(rowMatches(b, ctx, { outcome: 'all', state: 'counted' })).toBe(false);
    expect(rowMatches(b, ctx, { outcome: 'error', state: 'invalid' })).toBe(true);
    expect(rowMatches(b, { ...ctx, section: 'chat' as never }, NO_FILTERS)).toBe(false);
  });

  it('a setup filter drops runs whose setup is unknown', () => {
    const f = { ...ctx, filters: { harness: new Set(['pi']) } };
    expect(rowMatches(row({}), f, NO_FILTERS)).toBe(false);
  });

  it('sorts: dates and scores put missing values last in both directions', () => {
    const rows = [
      row({ id: '1', startedAt: '2026-01-01T00:00:00Z', score: 3 }),
      row({ id: '2', startedAt: null, score: null }),
      row({ id: '3', startedAt: '2026-02-01T00:00:00Z', score: 9 }),
    ];
    const ids = (k: Parameters<typeof sortRuns>[1]) => sortRuns(rows, k).map((r) => r.id);
    expect(ids('newest')).toEqual(['3', '1', '2']);
    expect(ids('oldest')).toEqual(['1', '3', '2']);
    expect(ids('score-high')).toEqual(['3', '1', '2']);
    expect(ids('score-low')).toEqual(['1', '3', '2']);
  });

  it('sorts by model name then id', () => {
    const rows = [
      row({ id: '1', model: 'beta' }),
      row({ id: '2', model: 'Alpha', modelId: 'z/alpha' }),
      row({ id: '3', model: 'Alpha', modelId: 'a/alpha' }),
    ];
    expect(sortRuns(rows, 'model').map((r) => r.id)).toEqual(['3', '2', '1']);
  });

  it('months: newest first, unknown last, label in words', () => {
    expect(orderMonths(['2026-09', 'unknown', '2026-11', 'junk', '2026-10'])).toEqual([
      '2026-11',
      '2026-10',
      '2026-09',
      'unknown',
    ]);
    expect(
      monthsOfIndex({
        months: [{ id: '2026-10', runs: 2 }, { id: 'unknown', runs: 1 }, { id: '2026-11' }, 7],
      }),
    ).toEqual(['2026-11', '2026-10', 'unknown']);
    expect(monthsOfIndex(null)).toEqual([]);
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(monthLabel('unknown')).toBe('runs with no start time');
  });
});
