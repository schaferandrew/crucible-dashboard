import { describe, expect, it } from 'vitest';
import { syntheticIndex } from '../../../../tests/fixture';
import type { Cell } from '$lib/core/types';
import { buildTodo, pickSection, sectionChoices } from './build';
import {
  catalogTimes,
  computeLeft,
  countsLine,
  estimateText,
  NO_TIMES,
  recommend,
  sortEntries,
  whyClass,
  type Entry,
  type Left,
  type TaskLite,
} from './shape';
import { parseTodoUrl, todoSearch } from './url';

const tasks: TaskLite[] = ['t1', 't2', 't3', 't4'].map((id) => ({ id, name: id, tier: 'Tier' }));
const blk = (o: Record<string, number | null>) => ({
  n: 1,
  n_scored: 0,
  mean: null,
  min: null,
  max: null,
  n_finished: 0,
  mean_finished: null,
  timeouts: 0,
  errors: 0,
  ...o,
});
const cell = (task: string, runs: number, counted?: ReturnType<typeof blk>) =>
  [task, { setup: 's', task, runs, counted } as unknown as Cell] as const;

describe('url codec (TODO-URL-01..04)', () => {
  it('defaults and round trip', () => {
    expect(parseTodoUrl('')).toEqual({ suite: null, mode: null, sort: 'easiest', all: false });
    const u = parseTodoUrl('?suite=v3&mode=chat&sort=time&all=1');
    expect(u).toEqual({ suite: 'v3', mode: 'chat', sort: 'time', all: true });
    expect(todoSearch(u, 'v4')).toBe('suite=v3&mode=chat&sort=time&all=1');
    expect(todoSearch({ ...u, suite: 'v4', sort: 'easiest', all: false, mode: null }, 'v4')).toBe('');
  });
  it('unknown sort is easiest; all only for 1; garbage never throws', () => {
    expect(parseTodoUrl('sort=zzz&all=yes&suite=%E0%A4%A').sort).toBe('easiest');
    expect(parseTodoUrl('all=true').all).toBe(false);
  });
});

describe('times (TODO-DATA-04)', () => {
  it('typical comes from the catalog; untimed tasks are null; pace is 1', () => {
    const times = catalogTimes([
      { id: 't1', typical_time: 20 },
      { id: 't2', typical_time: null },
      { id: 't3' },
      { id: 't4', typical_time: 0 },
    ]);
    expect(times.typical('t1')).toBe(20);
    for (const t of ['t2', 't3', 't4', 'nope']) expect(times.typical(t)).toBeNull();
    expect(times.pace('a', ['t1'])).toBe(1);
  });
});

describe('computeLeft (TODO-DATA-02..05)', () => {
  const done = blk({ n_scored: 1, mean: 7, n_finished: 1 });
  it('null when every task has a counted mean', () => {
    const cells = new Map(tasks.map((t) => cell(t.id, 1, done)));
    expect(computeLeft('s', tasks, cells, NO_TIMES)).toBeNull();
  });
  it('explains why each task is missing and counts effort', () => {
    const cells = new Map([
      cell('t1', 1, blk({ n: 1, timeouts: 1 })), // one timeout
      cell('t2', 1, blk({ n: 1 })), // finished, unscored
      cell('t3', 2, undefined), // only older runs
      // t4: no cell
    ]);
    const l = computeLeft('s', tasks, cells, NO_TIMES)!;
    expect(l.tasks.map((x) => x.why)).toEqual([
      'timed out',
      'awaiting score',
      'only older or uncounted runs',
      'not run',
    ]);
    expect(l.toRun).toBe(3);
    expect(l.awaiting).toBe(1);
    expect(l.failed).toBe(1);
    expect(l.effort).toBe(2 + 1 + 1); // the failed task counts extra
    expect(l.unknown).toBe(3);
    expect(estimateText(l)).toBe('—');
  });
  it('several failures say how many; extra effort is capped at 3', () => {
    const cells = new Map([cell('t1', 9, blk({ n: 9, errors: 9 }))]);
    const l = computeLeft('s', tasks.slice(0, 1), cells, NO_TIMES)!;
    expect(l.tasks[0]!.why).toBe('failed 9×');
    expect(l.effort).toBe(4);
  });
  it('estimates typical x pace and leaves awaiting tasks unestimated', () => {
    const times = {
      typical: (t: string) => (t === 't1' ? 60 : null),
      pace: () => 2,
    };
    const cells = new Map([cell('t2', 1, blk({ n: 1 }))]);
    const l = computeLeft('s', tasks.slice(0, 2), cells, times)!;
    expect(l.tasks[0]!.time).toBe(120);
    expect(l.tasks[1]!.time).toBeNull();
    expect(l.est).toBe(120);
    expect(l.unknown).toBe(0);
    expect(estimateText(l)).toBe('≈ 2m 00s');
    expect(estimateText({ toRun: 0, unknown: 0, est: 0 })).toBe('scoring only');
    expect(estimateText({ toRun: 3, unknown: 1, est: 60 })).toBe('≈ 1m 00s + 1 untimed task');
  });
  it('whyClass slugs the why (TODO-TABLE-04)', () => {
    expect(whyClass('not run')).toBe('');
    expect(whyClass('failed 3×')).toBe('is-failed');
    expect(whyClass('timed out')).toBe('is-timed-out');
    expect(whyClass('awaiting score')).toBe('is-awaiting-score');
  });
});

describe('ordering and recommendation (TODO-DATA-06, TODO-PICK-*)', () => {
  const left = (over: Partial<Left>): Left => ({
    tasks: [],
    toRun: 1,
    failed: 0,
    awaiting: 0,
    est: 0,
    unknown: 0,
    effort: 1,
    pace: 1,
    ...over,
  });
  const entry = (label: string, score: number | null, l: Partial<Left>): Entry => ({
    key: label,
    label,
    score,
    stat: null,
    left: left(l),
  });
  const t = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      task: tasks[0]!,
      why: 'x',
      kind: 'not-run' as const,
      fails: i,
      time: null,
    }));
  const es = [
    entry('b', 5, { effort: 2, est: 10, tasks: t(2) }),
    entry('a', 9, { effort: 2, est: 10, tasks: t(2) }),
    entry('c', null, { effort: 1, est: 99, tasks: t(1) }),
    entry('d', 1, { effort: 5, est: 1, tasks: t(5) }),
  ];
  const order = (k: Parameters<typeof sortEntries>[1]) =>
    sortEntries(es, k)
      .map((e) => e.label)
      .join('');
  it('comparators', () => {
    expect(order('easiest')).toBe('cabd'); // effort, est, higher score
    expect(order('fewest')).toBe('cabd');
    expect(order('time')).toBe('dabc');
    expect(order('score')).toBe('abdc'); // null = -1
    expect(order('model')).toBe('abcd');
  });
  it('recommend: first easiest with tasks to run, up to three more', () => {
    const r = recommend(es)!;
    expect(r.entry.label).toBe('c');
    expect(r.then.map((e) => e.label)).toEqual(['a', 'b', 'd']);
    const onlyAwaiting = [entry('z', 1, { toRun: 0, effort: 0 }), entry('y', 1, { toRun: 1, effort: 3 })];
    expect(recommend(onlyAwaiting)!.entry.label).toBe('y');
    expect(recommend([entry('z', 1, { toRun: 0, effort: 0 })])!.entry.label).toBe('z');
    expect(recommend([])).toBeNull();
  });
  it('counts line', () => {
    expect(countsLine(0, false, 5, 2)).toBe('');
    expect(countsLine(1, false, 1, 0)).toBe('1 model with tasks left of 1 scored task.');
    expect(countsLine(3, true, 12, 2)).toBe(
      '3 setups with tasks left of 12 scored tasks; 2 already complete.',
    );
  });
});

describe('buildTodo on a suite', () => {
  const index = syntheticIndex();
  it('offers sections with tasks, never Combined; unknown mode falls back to the first', () => {
    const c = sectionChoices(index);
    expect(c.map((x) => x.id)).toEqual(['chat', 'agentic']);
    expect(pickSection(c, 'nope')!.id).toBe('chat');
    expect(pickSection(c, 'agentic')!.id).toBe('agentic');
    expect(pickSection([], null)).toBeNull();
  });
  it('lists only setups with tasks left and counts the complete ones', () => {
    const b = buildTodo(index, 'agentic', true, NO_TIMES);
    expect(b.entries.map((e) => e.stat.setup.id)).toEqual(['s-other']);
    expect(b.entries[0]!.left.tasks.map((x) => x.task.id)).toEqual(['a2']);
    expect(b.complete).toBe(b.considered - 1);
    expect(buildTodo(index, 'chat', false, NO_TIMES).entries).toEqual([]);
  });
});
