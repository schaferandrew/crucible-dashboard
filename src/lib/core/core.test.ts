import { describe, expect, it } from 'vitest';
import { syntheticIndex } from '../../../tests/fixture';
import {
  activeFilterCount,
  contextToSearch,
  defaultContext,
  parseContext,
  resolveContext,
  sameContext,
} from './context';
import { normalizeIndex } from './normalize';
import { scope, facet, changeSection } from './scope';
import { betterConfig, gateVerdict, rankRows, sectionView, viewFor } from './scoring';
import { COMBINED, asSetupId, asSuiteId, asTierId } from './types';

const env = { currentSuite: asSuiteId('s'), suites: [asSuiteId('s'), asSuiteId('old')] };

describe('context codec', () => {
  it('writes nothing for the default view', () => {
    expect(contextToSearch(defaultContext(env), env)).toBe('');
  });

  it('round-trips filters, exclusion, suite and section', () => {
    const search =
      'mode=chat&suite=old&exclude=forge&harness=pi&where=local&hw=m5-pro-48gb&quant=q4_k_m,-&provisional=1';
    const { ctx } = parseContext(search, env);
    expect(ctx.suite).toBe('old');
    expect(ctx.section).toBe('chat');
    expect([...ctx.exclude]).toEqual(['forge']);
    expect([...ctx.filters.quant!].sort()).toEqual(['q4_k_m', 'unrecorded']);
    expect(ctx.provisional).toBe(true);
    expect(contextToSearch(ctx, env)).toBe(search);
  });

  it('drops `all`, tolerates garbage and unknown suites', () => {
    const { ctx, unknownSuite } = parseContext('?suite=v1&where=all&harness=%E0%A4%A&x', env);
    expect(unknownSuite).toBe('v1');
    expect(ctx.suite).toBe('s');
    expect(ctx.filters.where).toBeUndefined();
    expect(ctx.filters.harness).toBeDefined();
  });

  it('keeps the section default out of the URL and resolves unknown sections', () => {
    const idx = syntheticIndex();
    expect(resolveContext({ ...defaultContext(env), section: 'nope' as never }, idx.catalog).section).toBe(
      COMBINED,
    );
    expect(sameContext(defaultContext(env), defaultContext(env))).toBe(true);
    const { ctx } = parseContext('mode=agentic&exclude=temper', env);
    expect(contextToSearch(ctx, env, idx.catalog)).toBe('mode=agentic&exclude=temper');
    expect(activeFilterCount(ctx)).toBe(1);
  });

  it('honours the remembered provisional choice only when the URL is silent', () => {
    expect(parseContext('', env, true).ctx.provisional).toBe(true);
    expect(parseContext('provisional=0', env, true).ctx.provisional).toBe(false);
  });
});

describe('scoring on a synthetic suite', () => {
  const idx = syntheticIndex();

  it('scores tiers by weight and takes the gate verdict', () => {
    const chat = sectionView(idx, 'chat');
    const s = chat.stats(chat.candidates()[0]!);
    expect(s.tier.spark!.score).toBe(10);
    expect(s.tier.temper!.score).toBe(8);
    expect(s.overall.score).toBe(18);
    expect(s.overall.max).toBe(20);
    expect(s.verdict.spark).toBe('pass');
  });

  it('gate verdicts: partial, fail, null', () => {
    const gate = { mean: 8, min: 5 };
    expect(gateVerdict(null, gate)).toBeNull();
    expect(
      gateVerdict({ score: 9, max: 10, coverage: 1, scored: 1, total: 1, min: 4, partial: false }, gate),
    ).toBe('fail');
    expect(
      gateVerdict({ score: 9, max: 10, coverage: 0.5, scored: 1, total: 2, min: 9, partial: true }, gate),
    ).toBe('partial');
  });

  it('leaves a tier out of Overall and never leaves none', () => {
    const chat = sectionView(idx, 'chat');
    const c = chat.candidates()[0]!;
    expect(chat.stats(c, new Set([asTierId('spark')])).overall.score).toBe(8);
    expect(chat.stats(c, new Set([asTierId('spark'), asTierId('temper')])).overall.score).toBe(18);
  });

  it('folds provisional tasks in only where they ran', () => {
    const chat = sectionView(idx, 'chat', true);
    const s = chat.stats(chat.candidates()[0]!);
    expect(s.tier.temper!.prov).toEqual({ scored: 1, total: 1 });
    expect(s.tier.temper!.scored).toBe(1); // coverage and scored stay on the active tasks
    expect(s.provisionalRan).toEqual({ done: 1, total: 1 });
    // the provisional task weighs what an active task of its category in the tier weighs (0.5)
    expect(s.overall.score).toBeCloseTo(10 + (0.5 * 8 + 0.5 * 6) / 1, 6);
  });

  it('pairs setups that match except the harness into one Combined row', () => {
    const view = viewFor(idx, COMBINED);
    expect(view.kind).toBe('combined');
    const pair = view.candidates().find((c) => c.members.filter(Boolean).length === 2)!;
    expect(pair.members.map((m) => m?.harness)).toEqual(['direct', 'pi']);
    const st = view.stats(pair);
    expect(st.overall.score).toBe(18 + 16);
    expect(st.overall.max).toBe(40);
    // s-other differs in reasoning: it pairs with nothing, and its chat section is missing (so it is partial)
    const lone = view.candidates().find((c) => c.first.id === 's-other')!;
    expect(lone.members[0]).toBeNull();
    expect(view.stats(lone).overall.partial).toBe(true);
  });

  it('ranks by Overall and picks the best setup of a row', () => {
    const s = scope(idx, { ...defaultContext(env), section: 'agentic' as never });
    expect(s.rows).toHaveLength(2); // two reasoning levels of one model
    const best = s.rows.find((r) => r.reasoning === 'default')!;
    expect(best.candidate.first.id).toBe('s-pi');
    const rank = rankRows(idx, s.rows);
    expect(rank.get(best.rowKey)).toBe(1);
    expect(betterConfig(s.rows[0]!, s.rows[0]!)).toBe(0);
  });

  it('filters narrow setups before the best is chosen; no filter means everything', () => {
    const base = { ...defaultContext(env), section: 'agentic' as never };
    expect(scope(idx, base).setups).toHaveLength(2);
    const high = scope(idx, { ...base, filters: { reasoning: new Set(['high']) } });
    expect(high.setups.map((s) => s.id)).toEqual(['s-other']);
    expect(high.rows).toHaveLength(1);
    const f = facet(idx, base, 'reasoning');
    expect(f.distinct).toBe(2);
    expect(f.options.map((o) => o.value).sort()).toEqual(['default', 'high']);
  });

  it('section switches clear filter values the section lacks (B-08)', () => {
    const ctx = {
      ...defaultContext(env),
      section: 'agentic' as never,
      filters: { harness: new Set(['pi']), reasoning: new Set(['high']) },
    };
    const toChat = changeSection(idx, ctx, 'chat');
    expect(toChat.filters.harness).toBeUndefined();
    expect(toChat.filters.reasoning).toBeUndefined();
    const toCombined = changeSection(idx, ctx, COMBINED);
    expect(toCombined.filters.harness).toBeUndefined();
    expect([...toCombined.filters.reasoning!]).toEqual(['high']);
  });

  it('the harness filter does not apply in Combined', () => {
    const ctx = { ...defaultContext(env), filters: { harness: new Set(['pi']) } };
    expect(scope(idx, ctx).rows).toHaveLength(2);
  });
});

describe('unknown data never throws', () => {
  it('survives an empty or broken index', () => {
    for (const raw of [undefined, null, 5, {}, { catalog: 3, cells: 'x', entities: { setups: { a: 1 } } }]) {
      const idx = normalizeIndex(raw);
      const ctx = defaultContext({ currentSuite: asSuiteId('s'), suites: [] });
      expect(() => scope(idx, ctx)).not.toThrow();
      expect(() => scope(idx, { ...ctx, section: 'ghost' as never })).not.toThrow();
      expect(scope(idx, ctx).rows).toEqual([]);
    }
  });

  it('renders setups with unknown tiers, tasks and setups in cells', () => {
    const idx = syntheticIndex();
    idx.cells.push({ setup: asSetupId('ghost'), task: 'nope' as never, runs: 1 });
    idx.catalog.tasks.push({
      ...idx.catalog.tasks[0]!,
      id: 'x1' as never,
      tier: 'forge' as never,
      mode: 'surprise' as never,
    });
    const ctx = { ...defaultContext(env), section: 'surprise' as never };
    expect(() => scope(idx, ctx)).not.toThrow();
  });
});
