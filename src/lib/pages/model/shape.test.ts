import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultContext, type DataContext } from '$lib/core/context';
import { normalizeIndex } from '$lib/core/normalize';
import type { SuiteId, SuiteIndex } from '$lib/core/types';
import { abSentence, abDimOf, speedPhrase } from './ab';
import { depStats, normalizeModelRuns, scoredRunOf, type SlimRun } from './runs';
import { translateModelParams } from './params';
import {
  deploymentTable,
  didNotFinish,
  findMaker,
  headline,
  isPicked,
  makerEntries,
  makerGroups,
  otherCounts,
  scopesOf,
  sectionsRan,
  toggleFilters,
  variantTable,
  wholeModel,
} from './shape';

const DATA = resolve(process.cwd(), 'static/data');
const have = existsSync(resolve(DATA, 'v4/index.json'));
const MODEL = 'qwen/qwen3.5-9b';

function load(): { index: SuiteIndex; runs: SlimRun[] } {
  const index = normalizeIndex(JSON.parse(readFileSync(resolve(DATA, 'v4/index.json'), 'utf8')));
  const raw = JSON.parse(readFileSync(resolve(DATA, 'v4/models/qwen__qwen3.5-9b.json'), 'utf8'));
  return { index, runs: normalizeModelRuns(raw, 'v4', MODEL).runs };
}

const env = { currentSuite: 'v4' as SuiteId, suites: ['v4' as SuiteId] };
const ctxOf = (index: SuiteIndex, section: string, filters: DataContext['filters'] = {}): DataContext => ({
  ...defaultContext(env),
  section: section as never,
  filters: { model: new Set([MODEL]), ...filters },
});

describe('filters from rows (B-19)', () => {
  const ctx = { ...defaultContext(env), filters: { model: new Set(['m']) } } as DataContext;

  it('picks, replaces and clears', () => {
    const on = toggleFilters(ctx, { quant: 'q4', reasoning: 'on' }, ['quant', 'reasoning']);
    expect([...on.filters.quant!]).toEqual(['q4']);
    expect(isPicked(on.filters, { quant: 'q4', reasoning: 'on' })).toBe(true);
    const other = toggleFilters(on, { quant: 'q8', reasoning: 'on' }, ['quant', 'reasoning']);
    expect([...other.filters.quant!]).toEqual(['q8']);
    const off = toggleFilters(other, { quant: 'q8', reasoning: 'on' }, ['quant', 'reasoning']);
    expect(off.filters.quant).toBeUndefined();
    expect(off.filters.reasoning).toBeUndefined();
    expect([...off.filters.model!]).toEqual(['m']);
  });

  it('an empty target is never picked', () => {
    expect(isPicked({}, {})).toBe(false);
  });
});

describe.skipIf(!have)('the model page on real data', () => {
  const { index, runs } = have ? load() : ({} as ReturnType<typeof load>);

  it('knows the sections the model ran in', () => {
    expect(sectionsRan(index, MODEL).length).toBeGreaterThan(0);
  });

  it('unfiltered, every variant and deployment is in scope and none is dimmed', () => {
    const ctx = ctxOf(index, 'combined');
    const { all, sc } = scopesOf(index, ctx);
    const vt = variantTable(index, all, sc, ctx);
    expect(vt.rows.length).toBeGreaterThan(1);
    expect(vt.shown).toBe(vt.total);
    expect(vt.rows.every((r) => !r.disabled && !r.picked)).toBe(true);
    const dt = deploymentTable(index, all, sc, ctx, runs);
    expect(dt.shown).toBe(dt.total);
    expect(headline(sc)).not.toBeNull();
  });

  it('picking a variant row dims the others and the same click clears it', () => {
    const section = sectionsRan(index, MODEL)[0]!;
    let ctx = ctxOf(index, section);
    let { all, sc } = scopesOf(index, ctx);
    let vt = variantTable(index, all, sc, ctx);
    expect(vt.rows.length).toBeGreaterThan(1);
    const row = vt.rows[1]!;
    ctx = toggleFilters(ctx, row.target, vt.clear);
    ({ all, sc } = scopesOf(index, ctx));
    vt = variantTable(index, all, sc, ctx);
    const picked = vt.rows.find((r) => r.key === row.key)!;
    expect(picked.picked).toBe(true);
    expect(picked.inScope).toBe(true);
    expect(vt.shown).toBeLessThan(vt.total);
    expect(vt.rows.filter((r) => !r.inScope).length).toBe(vt.total - vt.shown);
    // the whole model is still listed
    expect(vt.total).toBe(
      variantTable(index, all, scopesOf(index, ctxOf(index, section)).sc, ctxOf(index, section)).total,
    );
    // every block follows the same scope: the headline is one of the in-scope setups
    expect(sc.setups.some((s) => s.id === headline(sc)!.setup.id)).toBe(true);
    ctx = toggleFilters(ctx, row.target, vt.clear);
    expect(Object.keys(ctx.filters)).toEqual(['model']);
  });

  it('a deployment row filters and dims the others', () => {
    const section = sectionsRan(index, MODEL)[0]!;
    let ctx = ctxOf(index, section);
    let { all, sc } = scopesOf(index, ctx);
    let dt = deploymentTable(index, all, sc, ctx, runs);
    if (dt.rows.length < 2) return;
    ctx = toggleFilters(ctx, { deployment: dt.rows[0]!.id }, ['deployment']);
    ({ all, sc } = scopesOf(index, ctx));
    dt = deploymentTable(index, all, sc, ctx, runs);
    expect(dt.rows[0]!.picked).toBe(true);
    expect(dt.shown).toBe(1);
    expect(dt.rows.slice(1).every((r) => !r.inScope)).toBe(true);
    expect(sc.setups.every((s) => s.deployment === dt.rows[0]!.id)).toBe(true);
  });

  it('disables a variant row that never ran where the reader is looking', () => {
    const section = sectionsRan(index, MODEL)[0]!;
    const base = ctxOf(index, section);
    const first = scopesOf(index, base);
    const dt = deploymentTable(index, first.all, first.sc, base, runs);
    if (dt.rows.length < 2) return;
    // look at one deployment: a variant with no setup there would leave nothing, so it can't be picked
    for (const dep of dt.rows) {
      const ctx = toggleFilters(base, { deployment: dep.id }, ['deployment']);
      const { all, sc } = scopesOf(index, ctx);
      const vt = variantTable(index, all, sc, ctx);
      const dead = vt.rows.filter((r) => !r.inScope);
      for (const r of dead) expect(r.disabled).toBe(true);
      for (const r of vt.rows.filter((x) => x.inScope)) expect(r.disabled).toBe(false);
      if (dead.length) return;
    }
  });

  it('counts runs that did not finish and runs that do not count from the same scope', () => {
    const section = sectionsRan(index, MODEL)[0]!;
    const ctx = ctxOf(index, section);
    const { sc } = scopesOf(index, ctx);
    const dnf = didNotFinish(index, sc, runs);
    expect(dnf.every((d) => d.run.outcome !== 'finished' && d.run.state === 'counted')).toBe(true);
    const other = otherCounts(index, MODEL, ctx, sc.view, runs);
    expect(other).toEqual(index.other[MODEL] ?? {});
    const filtered = toggleFilters(ctx, { reasoning: 'zzz' }, ['reasoning']);
    const f = otherCounts(index, MODEL, filtered, sc.view, runs);
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(f)).toBeLessThanOrEqual(sum(other));
  });

  it('whole model ignores every filter but the pin', () => {
    const ctx = ctxOf(index, 'combined', { quant: new Set(['nope']) });
    expect(Object.keys(wholeModel(ctx).filters)).toEqual(['model']);
  });

  it('lists makers alphabetically with the unknown one last, and finds one without case', () => {
    const groups = makerGroups(index);
    const labels = groups.filter((g) => g.id !== 'unknown').map((g) => g.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(groups.some((g) => g.id === 'ibm-granite')).toBe(true);
    expect(findMaker(index, 'QWEN')).toBe('qwen');
    expect(findMaker(index, 'nobody')).toBeNull();
  });

  it('puts ranked models first on a maker page, the unrun last', () => {
    const ctx = { ...defaultContext(env), filters: { maker: new Set(['qwen']) } } as DataContext;
    const { sc } = scopesOf(index, ctx);
    const entries = makerEntries(index, 'qwen', sc);
    expect(entries.length).toBe(
      Object.values(index.entities.models).filter((m) => m.maker === 'qwen').length,
    );
    const firstNone = entries.findIndex((e) => !e.best);
    if (firstNone >= 0) expect(entries.slice(firstNone).every((e) => !e.best)).toBe(true);
  });

  it('translates legacy setup= and variant= params into filters and drops setup', () => {
    const setup = Object.values(index.entities.setups).find((s) => s.model === MODEL && s.where === 'local')!;
    const ctx = { ...ctxOf(index, 'combined'), focus: setup.id };
    const out = translateModelParams(index, MODEL, ctx, `setup=${setup.id}`);
    expect(out.focus).toBeUndefined();
    expect([...out.filters.deployment!]).toEqual([setup.deployment]);
    expect(out.filters.model).toBeDefined();
    // an explicit filter wins
    const own = translateModelParams(
      index,
      MODEL,
      { ...ctx, filters: { ...ctx.filters, deployment: new Set(['x']) } },
      '',
    );
    expect([...own.filters.deployment!]).toEqual(['x']);
    // variant= names a variant but not a deployment
    const v = translateModelParams(index, MODEL, ctxOf(index, 'combined'), `variant=${setup.variant}`);
    expect(v.filters.deployment).toBeUndefined();
    expect(Object.keys(v.filters).length).toBeGreaterThan(1);
    // nothing to translate: the same object back
    const same = ctxOf(index, 'combined');
    expect(translateModelParams(index, MODEL, same, '')).toBe(same);
  });
});

describe('A/B', () => {
  it('words the summary as the paired-comparison rules allow (PAIR-05/06)', () => {
    expect(abSentence({ shared: 0, diffs: [] }, 'A', 'B')).toBe('No task in common.');
    expect(abSentence({ shared: 4, diffs: [] }, 'A', 'B')).toBe('No task both finished, of the 4 both ran.');
    expect(abSentence({ shared: 6, diffs: [0.01, -0.02, 0, 0, 0, 0] }, 'A', 'B')).toContain(
      'scores the same as A on 6',
    );
    // five paired tasks, evenly spread: a headline is allowed
    expect(abSentence({ shared: 5, diffs: [1, 1, 1, 1, 1] }, 'a', 'b')).toBe(
      'B scores 1.0 higher than a on average on 5 shared finished tasks.',
    );
    // too few tasks: no headline
    expect(abSentence({ shared: 3, diffs: [1, 1, 0] }, 'a', 'b')).toBe(
      'A and b differ on 2 of 3 shared finished tasks.',
    );
    // one task carries the difference: no headline
    expect(abSentence({ shared: 6, diffs: [5, 0.5, 0.5, 0.5, 0.5] }, 'a', 'b')).toContain(
      'one task accounts for most',
    );
  });

  it('describes speed', () => {
    expect(speedPhrase(null, 'b')).toBe('');
    expect(speedPhrase({ a: 10, b: 10.2, ratio: 1.02, n: 4, faster: 2, slower: 2 }, 'b')).toMatch(
      /about the same/,
    );
    expect(speedPhrase({ a: 10, b: 20, ratio: 2, n: 4, faster: 0, slower: 4 }, 'b')).toBe(
      'B is slower on every one of the 4 timed tasks, by 2.0× at the median task.',
    );
    expect(speedPhrase({ a: 10, b: 5, ratio: 0.5, n: 4, faster: 3, slower: 1 }, 'b')).toContain(
      'faster on 3 of 4',
    );
  });

  it('needs exactly one differing dimension the section varies', () => {
    const s = (o: Record<string, string>) =>
      ({ artifact: 'a', reasoning: 'on', harness: 'pi', ...o }) as never;
    expect(abDimOf(s({}), s({ reasoning: 'off' }), false)).toBe('reasoning');
    expect(abDimOf(s({}), s({ artifact: 'b' }), false)).toBe('weights');
    expect(abDimOf(s({}), s({ artifact: 'b', reasoning: 'off' }), false)).toBeNull();
    expect(abDimOf(s({}), s({ harness: 'direct' }), false)).toBeNull();
    expect(abDimOf(s({}), s({ harness: 'direct' }), true)).toBe('harness');
  });
});

describe('runs', () => {
  const run = (o: Partial<SlimRun>): SlimRun => ({
    run_uuid: 'u',
    setup: 's',
    state: 'counted',
    score: 5,
    outcome: 'finished',
    elapsed_s: 10,
    tps: null,
    cost: null,
    started_at: '2026-01-01T00:00:00Z',
    machine: null,
    task: 't',
    ...o,
  });

  it('reads a model file tolerantly', () => {
    const r = normalizeModelRuns(
      { runs: [{ run_uuid: 'a', setup: 's', task: 't' }, { run_uuid: 'x' }, null, 4] },
      'v',
      'm',
    );
    expect(r.runs.length).toBe(1);
    expect(r.runs[0]!.state).toBe('unknown');
    expect(normalizeModelRuns(null, 'v', 'm').runs).toEqual([]);
  });

  it('takes the median over tasks of the task medians, and says when none finished', () => {
    const s = depStats([
      run({ task: 'a', elapsed_s: 10 }),
      run({ task: 'a', elapsed_s: 30 }),
      run({ task: 'b', elapsed_s: 100 }),
      run({ task: 'c', outcome: 'timed_out', elapsed_s: 900 }),
      run({ task: 'd', outcome: 'error', elapsed_s: 5 }),
    ]);
    expect(s).toMatchObject({ runs: 5, finished: 3, timedOut: 1, errors: 1 });
    expect(s.time).toBe(60); // median of [20, 100]
    const none = depStats([run({ outcome: 'timed_out', elapsed_s: 600 })]);
    expect(none.time).toBeNull();
    expect(none.timeAll).toBe(600);
  });

  it("opens a cell's newest counted, scored run", () => {
    const list = [
      run({ run_uuid: 'old', started_at: '2026-01-01' }),
      run({ run_uuid: 'new', started_at: '2026-02-01' }),
      run({ run_uuid: 'unscored', started_at: '2026-03-01', score: null }),
      run({ run_uuid: 'prov', state: 'provisional', started_at: '2026-04-01' }),
    ];
    expect(scoredRunOf(list, new Set(['counted']))!.run_uuid).toBe('new');
    expect(scoredRunOf(list, new Set(['counted', 'provisional']))!.run_uuid).toBe('new');
    expect(scoredRunOf([run({ state: 'older' })], new Set(['counted']))).toBeNull();
  });
});
