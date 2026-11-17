import { describe, expect, it } from 'vitest';
import {
  bestOf,
  computeNumbers,
  foldsTies,
  newestFinished,
  spreadRows,
  type CountedBlock,
  type NumSide,
  type RunInfo,
} from './numbers';
import { assignColors } from './resolve';
import { niceTime, scoreAxis, scoreAxisNote, thinTicks, timeAxis } from './scales';

const blk = (mean: number | null, over: Partial<CountedBlock> = {}): CountedBlock => ({
  n: 1,
  n_finished: mean === null ? 0 : 1,
  mean_finished: mean,
  timeouts: 0,
  errors: 0,
  ...over,
});
const tasks = [
  { id: 'a', name: 'A', tier: 'spark' },
  { id: 'b', name: 'B', tier: 'temper' },
  { id: 'c', name: 'C', tier: 'temper' },
  { id: 'd', name: 'D', tier: 'temper' },
];
const tiers = [{ id: 'spark' }, { id: 'temper' }, { id: 'forge' }];
const side = (b: Record<string, CountedBlock>, runs?: Record<string, RunInfo[]>): NumSide => ({
  counted: new Map(Object.entries(b)),
  runs: runs ? new Map(Object.entries(runs)) : undefined,
});
const run = (over: Partial<RunInfo> = {}): RunInfo => ({
  uuid: 'u',
  startedAt: '2026-01-01T00:00:00Z',
  outcome: 'finished',
  score: 5,
  elapsed: 10,
  tps: 20,
  cost: 0.1,
  ...over,
});

describe('shared and paired tasks (CMP-NUM-02)', () => {
  const x = side({ a: blk(8), b: blk(6), c: blk(null, { timeouts: 1 }) });
  const y = side({ a: blk(6), b: blk(6), c: blk(7), d: blk(9) });
  const n = computeNumbers([x, y], tasks, tiers);
  it('shares tasks every side ran and pairs those every side finished', () => {
    expect(n.shared.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(n.paired.map((t) => t.id)).toEqual(['a', 'b']);
    expect(n.score).toEqual([
      [8, 6],
      [6, 6],
    ]);
  });
  it('means, tops (ties count for both) and tier columns skip empty tiers', () => {
    expect(n.rows.map((r) => r.mean)).toEqual([7, 6]);
    expect(n.rows.map((r) => r.top)).toEqual([2, 1]);
    expect(n.tiers.map((t) => [t.tier, t.n, t.scores])).toEqual([
      ['spark', 1, [8, 6]],
      ['temper', 1, [6, 6]],
    ]);
  });
  it('lists what a side did not finish from the cells, even before runs load', () => {
    expect(n.rows[0]!.bad.map((b) => [b.task.id, b.k, b.n, b.timeouts, b.errors])).toEqual([
      ['c', 1, 1, 1, 0],
    ]);
    expect(n.timesLoaded).toBe(false);
    expect(n.rows[0]!.time).toBeNull();
  });
  it('is empty with no sides or no shared task', () => {
    expect(computeNumbers([], tasks, tiers).shared).toEqual([]);
    expect(computeNumbers([side({ a: blk(1) }), side({ b: blk(1) })], tasks, tiers).paired).toEqual([]);
  });
});

describe('time, speed and cost from the runs (B-09)', () => {
  const x = side(
    { a: blk(8, { n: 2 }), b: blk(6) },
    {
      a: [run({ elapsed: 10, cost: 0.2, tps: 10 }), run({ elapsed: 30, cost: 0.4, tps: 30 })],
      b: [run({ elapsed: 100, cost: 0.1, tps: 50 })],
    },
  );
  const y = side(
    { a: blk(6), b: blk(6) },
    { a: [run({ elapsed: 5, cost: null })], b: [run({ elapsed: 7 })] },
  );
  const n = computeNumbers([x, y], tasks, tiers);
  it('takes the median per task, then the median of those; cost is the mean of per-task means', () => {
    expect(n.timesLoaded).toBe(true);
    expect(n.time[0]).toEqual([20, 100]);
    expect(n.rows[0]!.time).toBe(60);
    expect(n.rows[0]!.cost).toBeCloseTo((0.3 + 0.1) / 2);
    expect(n.rows[1]!.cost).toBeCloseTo(0.1);
    expect(n.rows[0]!.tps).toEqual({ value: 30, n: 3 });
    expect(n.rows[0]!.finishedRuns).toBe(3);
  });
  it('knows the unfinished runs of a task once loaded', () => {
    const z = side(
      { a: blk(8, { n: 2, timeouts: 1 }) },
      { a: [run(), run({ outcome: 'timed_out', score: null, elapsed: 600 })] },
    );
    const m = computeNumbers([z, side({ a: blk(7) }, { a: [run()] })], tasks, tiers);
    expect(m.rows[0]!.bad[0]!.runs.map((r) => r.outcome)).toEqual(['timed_out']);
  });
});

describe('where they differ (CMP-DIFF-02/03/04)', () => {
  it('sorts by spread, widest first, then original order', () => {
    const x = side({ a: blk(5), b: blk(5), c: blk(9), d: blk(5) });
    const y = side({ a: blk(5), b: blk(7), c: blk(1), d: blk(5) });
    const rows = spreadRows(computeNumbers([x, y], tasks, tiers));
    expect(rows.map((r) => r.task.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(rows[0]!.spread).toBe(8);
  });
  it('folds ties only when more than five', () => {
    const rows = (k: number) =>
      Array.from({ length: k }, (_, i) => ({ task: tasks[0]!, values: [1, 1], spread: 0, order: i }));
    expect(foldsTies(rows(5))).toBe(false);
    expect(foldsTies(rows(6))).toBe(true);
  });
  it('finds the newest finished, scored run', () => {
    const r = [
      run({ uuid: 'old', startedAt: '2026-01-01' }),
      run({ uuid: 'new', startedAt: '2026-03-01' }),
      run({ uuid: 'bad', startedAt: '2026-04-01', outcome: 'error', score: null }),
    ];
    expect(newestFinished(r)).toMatchObject({ count: 2, newest: { uuid: 'new' } });
    expect(newestFinished(undefined)).toEqual({ newest: null, count: 0 });
  });
  it('highlights a best only with two known values', () => {
    expect(bestOf([3, null])).toBeNull();
    expect(bestOf([3, 4])).toBe(4);
  });
});

describe('axes (CMP-CHART-01, 03)', () => {
  it('starts the score axis at floor(min/2)*2, at most 8', () => {
    expect(scoreAxis([5.3, 9]).lo).toBe(4);
    expect(scoreAxis([5.3, 9]).ticks).toEqual([4, 6, 8, 10]);
    expect(scoreAxis([7.5, 9]).ticks).toEqual([6, 7, 8, 9, 10]);
    expect(scoreAxis([0.4, 9]).ticks).toEqual([0, 2, 4, 6, 8, 10]);
    expect(scoreAxis([10, 10]).lo).toBe(8);
    expect(scoreAxis([]).lo).toBe(0);
    expect(scoreAxisNote(scoreAxis([5, 9]))).toMatch(/starts at 4, not 0/);
    expect(scoreAxisNote(scoreAxis([1, 9]))).toBe('The axis runs from 0 to 10.');
    expect(scoreAxis([5, 9]).pos(10)).toBe(1);
  });
  it('builds a log time axis with 1/2/5 ticks', () => {
    const ax = timeAxis([3, 40])!;
    expect(ax.lo).toBe(2);
    expect(ax.hi).toBe(50);
    expect(ax.ticks).toEqual([2, 5, 10, 20, 50]);
    expect(ax.pos(2)).toBe(0);
    expect(ax.pos(50)).toBeCloseTo(1);
    expect(timeAxis([])).toBeNull();
    expect(timeAxis([7, 7])!.hi).toBeGreaterThan(7);
    expect(niceTime(120)).toBe('2m');
    expect(niceTime(20)).toBe('20s');
  });
  it('drops crowded ticks but keeps the first', () => {
    expect(thinTicks([1, 2, 3, 4], (v) => v * 20)).toEqual([1, 3]);
  });
});

describe('series colours (CMP-RESOLVE-03)', () => {
  const pal = ['c1', 'c2', 'c3', 'c4'];
  it('keeps a side colour and reuses freed ones', () => {
    const one = assignColors({}, ['a', 'b', 'c'], pal);
    expect(one).toEqual({ a: 'c1', b: 'c2', c: 'c3' });
    const two = assignColors(one, ['a', 'c'], pal);
    expect(two).toEqual({ a: 'c1', c: 'c3' });
    expect(assignColors(two, ['a', 'c', 'd'], pal).d).toBe('c2');
  });
});
