import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeIndex } from '$lib/core/normalize';
import { lowerFirst, shapeAbout } from './shape';

describe('lowerFirst', () => {
  it('lowers only the first letter', () => {
    expect(lowerFirst('One API call')).toBe('one API call');
  });
});

const catalog = normalizeIndex({
  suite: 'x',
  catalog: {
    suite: { id: 'x', name: 'X', changelog_url: null },
    modes: [
      { id: 'chat', label: 'Chat', blurb: 'One call', order: 1, areas: ['w'] },
      { id: 'ag', label: 'Agentic', blurb: '', order: 2, areas: [] },
    ],
    areas: [
      { id: 'w', label: 'Writing', mode: 'chat', order: 1, blurb: 'b', examples: '' },
      { id: 'c', label: '', mode: 'ag', order: 1, blurb: '', examples: 'e' },
    ],
    tiers: [
      { id: 't1', label: 'One', blurb: 'short', detail: '', order: 1 },
      { id: 't2', label: 'Two', blurb: 'short', detail: 'long', order: 2 },
    ],
    tasks: [
      { id: 'a', name: 'A task', status: 'active', mode: 'chat', tier: 't1' },
      { id: 'b', name: null, status: 'active', mode: 'ag', tier: 't1' },
      { id: 'r', name: 'Retired', status: 'retired', mode: 'chat', tier: 't1' },
    ],
  },
}).catalog;

describe('shapeAbout', () => {
  const v = shapeAbout(catalog, { a: ['rule 1'], b: [], r: ['old'] }, '1.2.3');
  it('takes sections, areas and fallbacks from the catalog', () => {
    expect(v.sectionLabels).toEqual(['Chat', 'Agentic']);
    expect(v.groups[0]!.heading).toBe('Chat · one call');
    expect(v.groups[1]!.heading).toBe('Agentic');
    expect(v.groups[0]!.areas[0]).toMatchObject({ label: 'Writing', blurb: 'b', examples: '—' });
    // a mode listing no areas gets the catalog's areas that name it; label falls back to the id
    expect(v.groups[1]!.areas[0]).toMatchObject({ label: 'c', blurb: '—', examples: 'e' });
  });
  it('prefers a tier detail over its blurb', () => {
    expect(v.tiers.map((t) => t.text)).toEqual(['short', 'long']);
  });
  it('lists rules only for active tasks that have some', () => {
    expect(v.ruleTasks).toEqual([{ id: 'a', name: 'A task', rules: ['rule 1'] }]);
  });
  it('defaults the changelog and labels', () => {
    expect(v.changelogUrl).toMatch(/SUITE_CHANGELOG\.md$/);
    expect(v.overallLabel).toBe('Overall');
    expect(v.combinedLabel).toBe('Combined');
    expect(v.crucibleVersion).toBe('1.2.3');
  });
});

describe.skipIf(!existsSync('static/data/meta.json'))('real data', () => {
  it('current suite has areas for every section and tier text', () => {
    const meta = JSON.parse(readFileSync('static/data/meta.json', 'utf8'));
    const idx = normalizeIndex(
      JSON.parse(readFileSync(`static/data/${meta.current_suite}/index.json`, 'utf8')),
    );
    const v = shapeAbout(idx.catalog, {}, meta.crucible_version);
    expect(v.groups.every((g) => g.areas.length > 0)).toBe(true);
    expect(v.tiers.every((t) => t.text)).toBe(true);
  });
});
