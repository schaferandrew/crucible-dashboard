import { describe, expect, it } from 'vitest';
import { syntheticIndex } from '../../../tests/fixture';
import { contextToSearch, defaultContext, parseContext } from './context';
import { panelCounts, panelFacet } from './panel';
import { scope } from './scope';
import { asSuiteId } from './types';

const env = { currentSuite: asSuiteId('s'), suites: [asSuiteId('s'), asSuiteId('old')] };
const idx = syntheticIndex();
const agentic = { ...defaultContext(env), section: 'agentic' as never };

describe('URL codec (B-01)', () => {
  it('round-trips every param family and is stable', () => {
    const search = 'mode=agentic&suite=old&exclude=spark&harness=pi&reasoning=default,high&provisional=1';
    const { ctx } = parseContext(search, env);
    expect(contextToSearch(ctx, env)).toBe(search);
    expect(contextToSearch(parseContext(contextToSearch(ctx, env), env).ctx, env)).toBe(search);
  });
  it('writes the setup focus and unrecorded as -', () => {
    const { ctx } = parseContext('setup=abc&quant=-,q4', env);
    expect(ctx.focus).toBe('abc');
    expect(contextToSearch(ctx, env)).toContain('quant=q4,-');
  });
});

describe('ControlPanel option counting (B-19)', () => {
  it('lists every value with its count', () => {
    const f = panelFacet(idx, agentic, 'reasoning');
    expect(f.options.map((o) => o.value).sort()).toEqual(['default', 'high']);
    expect(f.options.every((o) => o.count === 1 && !o.disabled)).toBe(true);
  });
  it('disables, not drops, a value the other choices would empty', () => {
    // a format no setup has leaves nothing, so no reasoning level would leave a row
    const ctx = { ...agentic, filters: { format: new Set(['none-such']) } };
    const f = panelFacet(idx, ctx, 'reasoning');
    expect(f.options.map((o) => [o.value, o.count, o.disabled]).sort()).toEqual([
      ['default', 0, true],
      ['high', 0, true],
    ]);
  });
  it('keeps a picked value enabled so it can be cleared', () => {
    const ctx = { ...agentic, filters: { format: new Set(['none-such']), reasoning: new Set(['high']) } };
    const high = panelFacet(idx, ctx, 'reasoning').options.find((o) => o.value === 'high')!;
    expect(high.selected).toBe(true);
    expect(high.disabled).toBe(false);
  });
  it('shows a stale picked value rather than hiding it', () => {
    const ctx = { ...agentic, filters: { quant: new Set(['nope']) } };
    expect(panelFacet(idx, ctx, 'quant').options.some((o) => o.value === 'nope' && !o.disabled)).toBe(true);
  });
  it('counts setups when asked, and totals', () => {
    const f = panelFacet(idx, agentic, 'harness', { unit: 'setups' });
    expect(f.options.reduce((n, o) => n + o.count, 0)).toBe(2);
    const sc = scope(idx, agentic);
    expect(panelCounts(idx, sc, 'setups')).toEqual({ shown: 2, total: 2, noun: 'setups' });
    expect(panelCounts(idx, sc).noun).toBe('models');
  });
});
