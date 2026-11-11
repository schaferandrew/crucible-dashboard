import { describe, expect, it } from 'vitest';
import { syntheticIndex } from '../../../../tests/fixture';
import { defaultContext } from '$lib/core/context';
import { scope } from '$lib/core/scope';
import { asSuiteId } from '$lib/core/types';
import { barName, barRows, layoutBars, shortName } from './bars';
import { areaResult, cellView, heatAreas, tierGroups } from './matrix';
import { caveat, emptyText, filterPhrase, leaderboardNote, orList } from './phrases';
import { parsePicks, togglePick } from './picks.svelte';
import { frontier, layoutScatter, logDomain, logTicks, scatterPoints } from './scatter';
import { takeaways } from './takeaways';

const env = { currentSuite: asSuiteId('s'), suites: [asSuiteId('s')] };
const idx = syntheticIndex();
const chat = { ...defaultContext(env), section: 'chat' as never };

describe('phrases', () => {
  it('joins lists with commas and "or"', () => {
    expect(orList(['a'])).toBe('a');
    expect(orList(['a', 'b', 'c'])).toBe('a, b or c');
  });

  it('describes filters in words; harness is ignored in Combined', () => {
    const view = scope(idx, chat).view;
    const ctx = { ...chat, filters: { where: new Set(['local']), reasoning: new Set(['high']) } };
    expect(filterPhrase(idx, ctx, view)).toBe('run locally at reasoning high');
    const comb = scope(idx, defaultContext(env)).view;
    expect(filterPhrase(idx, { ...chat, filters: { harness: new Set(['pi']) } }, comb)).toBe('');
    expect(emptyText(idx, defaultContext(env), comb)).toContain('any section of Suite s');
  });

  it('the leaderboard note names the gate and, in Combined, the pairing rule', () => {
    const note = leaderboardNote(scope(idx, defaultContext(env))).join(' ');
    expect(note).toContain('Ranked by Overall score (0–40)');
    expect(note).toContain(
      'Spark is also a pass/fail gate: a Spark score of at least 8, with no task below 5, in every section.',
    );
    expect(note).toContain('Each row joins one setup per section');
    expect(leaderboardNote(scope(idx, chat)).join(' ')).not.toContain('Each row joins');
  });

  it('the caveat only counts methods with a scored cell', () => {
    const c = caveat(idx);
    expect(c.methods).toEqual([]);
    expect(c.unscored.length).toBeGreaterThan(0);
  });
});

describe('takeaways', () => {
  it('says nobody has a complete score when nothing is ranked', () => {
    const lines = takeaways(idx, scope(idx, { ...chat, filters: { reasoning: new Set(['nope']) } }));
    expect(lines).toHaveLength(1);
    expect(String(lines[0]![0])).toContain('No model has a complete');
  });

  it('leads with the top rows as model links', () => {
    const sc = scope(idx, chat);
    const lines = takeaways(idx, sc);
    expect(lines.length).toBeGreaterThan(0);
    expect(JSON.stringify(lines[0])).toContain('"model"');
  });
});

describe('bars', () => {
  const sc = scope(idx, chat);
  it('orders rows best first and shortens long names (B-15)', () => {
    const rows = barRows(sc.visible);
    for (let i = 1; i < rows.length; i++)
      expect(rows[i - 1]!.overall.score!).toBeGreaterThanOrEqual(rows[i]!.overall.score!);
    expect(barName({ label: 'x (reasoning high)', inProgress: true })).toBe('x · high *');
    const long = 'a'.repeat(31);
    expect(shortName(long)).toBe('a'.repeat(29) + '…');
    expect(shortName('a'.repeat(30))).toBe('a'.repeat(30));
  });

  it('wide columns are at most 24 px in 56 px slots; narrow is one bar per 38 px row', () => {
    const rows = barRows(sc.visible);
    const wide = layoutBars(rows, 10, 900, false);
    expect(wide.bars.every((b) => b.w <= 24)).toBe(true);
    expect(wide.ticks.map((t) => t.v)).toEqual([0, 5, 10]);
    const narrow = layoutBars(rows, 10, 320, true);
    expect(narrow.height).toBe(4 + rows.length * 38);
  });
});

describe('scatter', () => {
  const sc = scope(idx, chat);
  it('domain is at least half a decade and ticks are 1x and 3x powers of ten', () => {
    const d = logDomain([10, 10]);
    expect(d.hi - d.lo).toBeCloseTo(0.7);
    expect(logTicks(0.9, 1.6)).toEqual([10, 30]);
  });

  it('keeps only strictly improving points on the frontier', () => {
    const pts = scatterPoints(sc.visible, 'time');
    const f = frontier(pts, 'time');
    expect(f.length).toBeLessThanOrEqual(pts.length);
    if (pts.length) {
      const l = layoutScatter(pts, 'time', 20, 400);
      expect(l.narrow).toBe(true);
      expect(l.dots).toHaveLength(pts.length);
    }
  });
});

describe('matrix', () => {
  const sc = scope(idx, chat);
  const row = sc.visible[0]!;
  it('shows integers wide, one decimal in cards, and marks empty cells', () => {
    const cells = idx.cells.filter((c) => c.setup === row.setup.id);
    const c1 = cellView(
      cells.find((c) => c.task === 'c2'),
      false,
      row.label,
      'c2',
    );
    expect(c1.state).toBe('scored');
    expect(c1.wide).toBe('8');
    expect(c1.card).toBe('8.0');
    expect(cellView(undefined, false, 'r', 't').state).toBe('empty');
  });

  it('a provisional task reads its provisional block', () => {
    const cell = idx.cells.find((c) => c.task === 'p1')!;
    expect(cellView(cell, true, 'r', 'p1').mean).toBe(6);
    expect(cellView(cell, false, 'r', 'p1').state).toBe('uncounted');
  });

  it('heatmap areas and tier groups come from the section', () => {
    const areas = heatAreas(idx, sc.view);
    expect(areas.map((a) => a.id)).toEqual(['x']);
    const r = areaResult(idx, sc.view, row.setup.id, areas[0]!);
    expect(r.total).toBe(2);
    expect(r.score).toBe(9);
    expect(tierGroups(sc.view).map((g) => g.id)).toEqual(['spark', 'temper']);
    expect(heatAreas(idx, scope(idx, defaultContext(env)).view)).toEqual([]);
  });
});

describe('compare picks', () => {
  it('keeps four, dropping the oldest, and tolerates bad storage', () => {
    let ids: string[] = [];
    for (const s of ['a', 'b', 'c', 'd', 'e']) ids = togglePick(ids, s);
    expect(ids).toEqual(['b', 'c', 'd', 'e']);
    expect(togglePick(ids, 'c')).toEqual(['b', 'd', 'e']);
    expect(parsePicks('["a",3,"b"]')).toEqual(['a', 'b']);
    expect(parsePicks('not json')).toEqual([]);
    expect(parsePicks(null)).toEqual([]);
  });
});
