import { describe, expect, it } from 'vitest';
import { syntheticIndex } from '../../../../tests/fixture';
import {
  buildEntries,
  checkColumns,
  checkStats,
  dumbbells,
  effortPoints,
  indexForTask,
  indexSections,
  isLongPrompt,
  isProvisional,
  logDomain,
  logTicks,
  notCounted,
  parseTaskFile,
  placeLabels,
  resolveTask,
  similarTasks,
  spreadLayout,
  square,
  tiles,
  type Entry,
  type RunDetail,
  type SlimRun,
} from './shape';

const index = syntheticIndex();
const run = (uuid: string, setup: string, score: number | null, extra: Partial<SlimRun> = {}): SlimRun => ({
  uuid,
  setup,
  state: 'counted',
  score,
  outcome: 'finished',
  elapsed: 10,
  cost: 0.1,
  startedAt: '2026-01-01T00:00:00Z',
  tokensOut: null,
  groups: null,
  ...extra,
});

describe('parseTaskFile', () => {
  it('reads a task and its runs, tolerating junk', () => {
    const f = parseTaskFile({
      suite: 'v4',
      task: {
        id: 't',
        scoring: { method: 'checks', total: 5, unit: 'points' },
        rules: ['a', { label: 'b' }, 3],
        criteria: [{ id: 'x', max_score: 2 }],
      },
      runs: [{ run_uuid: 'u1', setup: 's', state: 'counted', score: 7, elapsed_s: 'x' }, { nope: 1 }, null],
    })!;
    expect(f.task.name).toBe('T');
    expect(f.task.scale).toBe(10);
    expect(f.task.rules).toEqual(['a', 'b']);
    expect(f.task.criteria).toEqual([{ label: 'x', max: 2 }]);
    expect(f.runs).toHaveLength(1);
    expect(f.runs[0]!.elapsed).toBeNull();
  });
  it('returns null without a task id', () => {
    expect(parseTaskFile({})).toBeNull();
    expect(parseTaskFile(null)).toBeNull();
  });
});

describe('finding tasks', () => {
  it('resolves ids and aliases', () => {
    expect(resolveTask(index.catalog, 'c1')?.id).toBe('c1');
    expect(resolveTask(index.catalog, 'nope')).toBeNull();
  });
  it('lists similar shown tasks, provisional only when shown', () => {
    expect(similarTasks(index.catalog, 'c', false).map((t) => t.id)).toEqual(['c1', 'c2']);
    expect(similarTasks(index.catalog, 'p', false)).toEqual([]);
    expect(similarTasks(index.catalog, 'p', true).map((t) => t.id)).toEqual(['p1']);
  });
  it('treats any status but active or retired as provisional', () => {
    expect(isProvisional('active')).toBe(false);
    expect(isProvisional('retired')).toBe(false);
    expect(isProvisional('draft')).toBe(true);
    expect(isProvisional(null)).toBe(true);
  });
});

describe('indexSections', () => {
  it('groups by section and area, hides provisional until asked', () => {
    const s = indexSections(index, 'combined', false);
    expect(s.map((x) => x.id)).toEqual(['chat', 'agentic']);
    expect(s[0]!.count).toBe(2);
    expect(indexSections(index, 'combined', true)[0]!.count).toBe(3);
    expect(indexSections(index, 'agentic', false)).toHaveLength(1);
  });
});

describe('buildEntries', () => {
  const task = { status: 'active' };
  it('makes one entry per setup, best score first, and counts what it leaves out', () => {
    const runs = [
      run('a', 's-chat', 6, { startedAt: '2026-01-01T00:00:00Z' }),
      run('b', 's-chat', 8, { startedAt: '2026-02-01T00:00:00Z' }),
      run('c', 's-pi', 9),
      run('d', 's-other', null),
      run('e', 'ghost', 5),
      run('f', 's-pi', 4, { state: 'older' }),
    ];
    const b = buildEntries(index, task, runs, null);
    expect(b.entries.map((e) => e.setup.id)).toEqual(['s-pi', 's-chat']);
    expect(b.entries[1]!.mean).toBe(7);
    expect(b.entries[1]!.latest.uuid).toBe('b');
    expect(b.unscored).toBe(1);
    expect(b.unknownSetup).toBe(1);
    expect(notCounted(b.states, task)).toBe(1);
  });
  it('applies the allowed set', () => {
    const b = buildEntries(index, task, [run('a', 's-chat', 6), run('c', 's-pi', 9)], new Set(['s-chat']));
    expect(b.entries).toHaveLength(1);
    expect(b.filteredOut).toBe(1);
  });
  it('uses provisional runs for a provisional task', () => {
    const b = buildEntries(
      index,
      { status: 'provisional' },
      [run('a', 's-chat', 6, { state: 'provisional' })],
      null,
    );
    expect(b.entries).toHaveLength(1);
  });
  it('breaks ties by time, null last', () => {
    const b = buildEntries(
      index,
      task,
      [run('a', 's-chat', 5, { elapsed: null }), run('b', 's-pi', 5, { elapsed: 3 })],
      null,
    );
    expect(b.entries.map((e) => e.setup.id)).toEqual(['s-pi', 's-chat']);
  });
});

const entries = buildEntries(
  index,
  { status: 'active' },
  [run('a', 's-chat', 10, { elapsed: 20 }), run('b', 's-pi', 10, { elapsed: 5 }), run('c', 's-other', 4)],
  null,
).entries;

describe('tiles', () => {
  it('counts setups, maxed, median and the fastest top score', () => {
    const t = tiles(entries, 10);
    expect(t.setups).toBe(3);
    expect(t.maxed).toBe(2);
    expect(t.median).toBe(10);
    expect(t.min).toBe(4);
    expect(t.fastest?.setup.id).toBe('s-pi');
    expect(tiles([], 10).fastest).toBeNull();
  });
});

describe('checks', () => {
  const d = (groups: [string, number][]): RunDetail => ({
    groups: groups.map(([key, value]) => ({ key, value })),
    tokensOut: null,
  });
  const details = new Map([
    [
      'a',
      d([
        ['Renders', 1],
        ['Submit', 0.5],
      ]),
    ],
    [
      'b',
      d([
        ['Renders', 1],
        ['Submit', 0],
      ]),
    ],
  ]);
  it('ranks checks hardest first', () => {
    const s = checkStats(entries, details);
    expect(s.map((x) => x.key)).toEqual(['Submit', 'Renders']);
    expect(s[0]).toMatchObject({ rate: 0.25, n: 2, full: 0 });
    expect(s[1]).toMatchObject({ rate: 1, n: 2, full: 2 });
  });
  it('orders columns by the catalog then first seen', () => {
    expect(checkColumns(entries, details, ['Submit'])).toEqual(['Submit', 'Renders']);
    expect(checkColumns(entries, new Map(), [])).toEqual([]);
  });
  it('classifies squares', () => {
    expect(square(1).kind).toBe('pass');
    expect(square(0).kind).toBe('fail');
    expect(square(0.6)).toMatchObject({ kind: 'partial', text: 'partly passed (60%)' });
    expect(square(undefined).kind).toBe('none');
  });
  it('reads groups and tokens from the task file runs', () => {
    const f = parseTaskFile({
      task: { id: 't' },
      runs: [
        {
          run_uuid: 'a',
          groups: [
            ['A', 3, 4],
            ['Empty', 0, 0],
          ],
          tokens_out: 321,
        },
        { run_uuid: 'b', groups: null },
      ],
    });
    expect(f?.runs[0]).toMatchObject({ groups: [{ key: 'A', value: 0.75 }], tokensOut: 321 });
    expect(f?.runs[1]).toMatchObject({ groups: null, tokensOut: null });
  });
});

describe('charts', () => {
  it('stacks coinciding scores and shrinks the step to fit', () => {
    const l = spreadLayout(entries.slice(0, 2));
    expect(l.maxStack).toBe(2);
    expect(l.dots.map((x) => x.stack).sort()).toEqual([0, 1]);
    const many = Array.from({ length: 40 }, () => entries[0]!);
    const big = spreadLayout(many);
    expect(big.step).toBeCloseTo(230 / 40);
    expect(big.r).toBeGreaterThanOrEqual(2.5);
  });
  it('leaves off setups without a positive value', () => {
    const e = effortPoints(entries, 'time', new Map());
    expect(e.points).toHaveLength(3);
    const t = effortPoints(entries, 'tokens', new Map([['a', 500]]));
    expect(t.points).toHaveLength(1);
    expect(t.skipped).toBe(2);
    const c = effortPoints(
      entries.map((x) => ({ ...x, cost: 0 })),
      'cost',
      new Map(),
    );
    expect(c.points).toHaveLength(0);
  });
  it('pads the log domain and picks decade ticks', () => {
    const [lo, hi] = logDomain([10]);
    expect(hi - lo).toBeGreaterThan(0.5);
    expect(logTicks(0, 2)).toEqual([1, 3, 10, 30, 100]);
  });
  it('places a label where nothing overlaps, or none', () => {
    const [a, b] = entries as [Entry, Entry];
    const dots = [
      { entry: a, px: 100, py: 100 },
      { entry: b, px: 300, py: 100 },
    ];
    const p = placeLabels(dots, [a, b], 400, 200, (e) => e.label);
    expect(p).toHaveLength(2);
    expect(p[0]!.anchor).toBe('start');
    // a dot in the far corner has no room
    expect(placeLabels([{ entry: a, px: 2, py: 2 }], [a], 20, 20, () => 'long long label')).toEqual([]);
  });
});

describe('dumbbells', () => {
  it('pairs setups identical but for the harness', () => {
    // s-chat (direct) and s-pi (pi) share model, reasoning, quant, hardware, provider and where
    const rows = dumbbells(entries, ['direct', 'pi']);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.members.map((m) => m.setup.harness)).toEqual(['direct', 'pi']);
    expect(rows[0]!.max).toBe(10);
  });
  it('is empty without a second harness', () => {
    expect(
      dumbbells(
        entries.filter((e) => e.setup.id === 's-pi'),
        ['pi'],
      ),
    ).toEqual([]);
  });
});

describe('misc', () => {
  it('treats long prompts as collapsible', () => {
    expect(isLongPrompt('a\n'.repeat(13))).toBe(true);
    expect(isLongPrompt('x'.repeat(1101))).toBe(true);
    expect(isLongPrompt('short')).toBe(false);
  });
  it('restricts the index to one task', () => {
    const t = indexForTask(index, 'a1');
    expect(t.cells.every((c) => c.task === 'a1')).toBe(true);
    expect(t.cells.length).toBe(2);
  });
});
