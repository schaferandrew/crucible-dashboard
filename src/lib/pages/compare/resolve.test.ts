import { describe, expect, it } from 'vitest';
import { syntheticIndex } from '../../../../tests/fixture';
import { COMBINED } from '$lib/core/types';
import { parseCompareQuery } from './sides';
import { pickerGroups, resolveCompare, shortLabels, variantText } from './resolve';

const idx = syntheticIndex();

describe('compare URL (B-01)', () => {
  it('reads s, mode and suite; ids keep `+`, `@`, `/` and `~`', () => {
    const q = parseCompareQuery('?s=a%2Fb~c%40d,e+f&mode=chat&suite=v3');
    expect(q).toEqual({ s: ['a/b~c@d', 'e+f'], mode: 'chat', suite: 'v3' });
  });
  it('tolerates nothing, garbage and bad escapes', () => {
    expect(parseCompareQuery('')).toEqual({ s: [], mode: null, suite: null });
    expect(parseCompareQuery('?s=%E0%A4%A,,&x')).toMatchObject({ s: ['%E0%A4%A'] });
  });
});

describe('resolving setups (CMP-RESOLVE-01/02, B-18)', () => {
  it('defaults to Combined with nothing chosen', () => {
    const r = resolveCompare(idx, [], null);
    expect(r.section).toBe(COMBINED);
    expect(r.explicitMode).toBe(false);
    expect(r.items).toEqual([]);
  });
  it('uses the one section the setups share', () => {
    const r = resolveCompare(idx, ['s-pi', 's-other'], null);
    expect(r.section).toBe('agentic');
    expect(r.items.map((c) => c.id)).toEqual(['s-pi', 's-other']);
    expect(r.notes).toEqual([]);
  });
  it('goes to Combined when setups span sections, and finds the pairing that holds them', () => {
    const r = resolveCompare(idx, ['s-chat', 's-other'], null);
    expect(r.section).toBe(COMBINED);
    expect(r.items.map((c) => c.id)).toEqual(['s-chat+s-pi', 's-other']);
  });
  it('accepts a Combined side id', () => {
    const r = resolveCompare(idx, ['s-chat+s-pi', 's-other'], null);
    expect(r.section).toBe(COMBINED);
    expect(r.items).toHaveLength(2);
  });
  it('leaves out unknown ids, duplicates, other-section setups and extras with a note', () => {
    const r = resolveCompare(idx, ['nope', 's-pi', 's-pi', 's-chat'], 'agentic');
    expect(r.items.map((c) => c.id)).toEqual(['s-pi']);
    expect(r.notes[0]).toBe('"nope" isn\'t a setup in the results, so it was left out.');
    expect(r.notes[1]).toMatch(
      /ran in Chat, not Agentic\. Setups from different sections can't be compared, so it was left out\.$/,
    );
    expect(r.explicitMode).toBe(true);
  });
  it('notes an unknown section and falls back', () => {
    const r = resolveCompare(idx, ['s-pi'], 'nonsense');
    expect(r.notes[0]).toBe('There is no section "nonsense" in Suite s.');
    expect(r.section).toBe('agentic');
    expect(r.explicitMode).toBe(false);
  });
  it('limits to four', () => {
    const many = Array.from({ length: 5 }, (_, i) => `x${i}`);
    expect(resolveCompare(idx, many, null).items).toEqual([]);
  });
  it('maps an old slug through the legacy map', () => {
    const r = resolveCompare(idx, ['old-slug'], null, { 'old-slug': 's-pi' });
    expect(r.items.map((c) => c.id)).toEqual(['s-pi']);
  });
  it('never throws on an empty suite', () => {
    expect(() => resolveCompare(idx, ['', ' ', 'zzz'], 'chat')).not.toThrow();
  });
});

describe('labels', () => {
  const r = resolveCompare(idx, ['s-pi', 's-other'], null);
  it('uses the row label, adding the variant only to tell two of one model apart', () => {
    expect(shortLabels(idx, r.items, false)).toEqual(['a', 'a (reasoning high)']);
    const twice = [r.items[0]!, { ...r.items[0]!, id: 'dup' }];
    expect(shortLabels(idx, twice, true)).toEqual([
      'a (reasoning default · pi, via openrouter)',
      'a (reasoning default · pi, via openrouter)',
    ]);
  });
  it('writes the variant', () => {
    expect(variantText(r.items[0]!, true)).toBe('reasoning default · pi');
  });
  it('groups the picker by maker and leaves out the chosen', () => {
    const cands = r.view.candidates();
    const g = pickerGroups(idx, cands, [r.items[0]!]);
    expect(g).toHaveLength(1);
    expect(g[0]!.options.map((o) => o.id)).toEqual(['s-other']);
  });
});
