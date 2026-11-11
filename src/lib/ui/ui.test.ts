import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRunLinkIndex } from '../core/runlink';
import { contrast, heat, heatRgb } from './heat';
import { describeNotShown, notShownLine } from './notShown';
import { documentTitle } from './title';

describe('heat (FMT-09) meets AA', () => {
  it('every score 0..10 has >= 4.5:1 text', () => {
    for (let i = 0; i <= 100; i++) expect(heat(i / 10)!.ratio).toBeGreaterThanOrEqual(4.5);
  });
  it('same ramp ends as the live site; null has no heat', () => {
    expect(heatRgb(0)).toEqual([234, 242, 251]);
    expect(heatRgb(10)).toEqual([24, 86, 163]);
    expect(heat(null)).toBeNull();
  });
});

describe('token contrast (AA)', () => {
  const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
  const blocks = css.split('@media (prefers-color-scheme: dark)');
  const read = (src: string) => {
    const m = new Map<string, number[]>();
    for (const [, k, h] of src.matchAll(/--([\w-]+):\s*#([0-9a-f]{6})/gi))
      m.set(
        k!,
        [0, 2, 4].map((i) => parseInt(h!.slice(i, i + 2), 16)),
      );
    return m;
  };
  const light = read(blocks[0]!);
  const dark = new Map([...light, ...read(blocks[1]!)]);
  const pairs: [string, string][] = [
    ['fg', 'bg'],
    ['muted', 'bg'],
    ['muted', 'tray'],
    ['faint', 'bg'],
    ['accent', 'bg'],
    ['accent', 'accent-soft'],
    ['on-accent', 'accent'],
    ['local-ink', 'local-tint'],
    ['cloud-ink', 'cloud-tint'],
    ['good', 'good-soft'],
    ['bad', 'bad-soft'],
    ['warn', 'warn-soft'],
    ['fg', 'surface'],
    ['muted', 'surface'],
  ];
  for (const [name, theme] of [
    ['light', light],
    ['dark', dark],
  ] as const)
    it(`${name}: text pairs >= 4.5:1`, () => {
      for (const [a, b] of pairs) {
        const ca = theme.get(a) as [number, number, number];
        const cb = theme.get(b) as [number, number, number];
        expect(contrast(ca, cb), `${a} on ${b}`).toBeGreaterThanOrEqual(4.5);
      }
    });
});

describe('not-shown line (J-18)', () => {
  it('names every reason, singular and plural', () => {
    expect(notShownLine({ older: 5, invalid: 4, withdrawn: 1 })).toBe(
      '10 runs not shown: 5 from an older version of their task, 4 marked invalid and 1 withdrawn',
    );
    expect(notShownLine({ invalid: 1 })).toBe('1 run not shown: 1 marked invalid');
    expect(notShownLine({})).toBe('');
    expect(describeNotShown({ weird_state: 2 }).reasons[0]!.text).toBe('2 weird state');
  });
});

describe('titles and run links', () => {
  it('document title', () => {
    expect(documentTitle('Leaderboard')).toBe('Leaderboard · Crucible');
    expect(documentTitle('Crucible')).toBe('Crucible');
  });
  it('setup x task -> run from cell-runs', () => {
    const ix = buildRunLinkIndex({
      setups: ['s1', 's2'] as never,
      tasks: ['t1', 't2'] as never,
      runs: [
        [0, 1, 'r1'],
        [1, 0, 'r2'],
        [9, 0, 'bad'],
      ] as never,
    });
    expect(ix.get('s1', 't2')).toBe('r1');
    expect(ix.get('s2', 't1')).toBe('r2');
    expect(ix.get('s1', 't1')).toBeNull();
    expect(ix.size).toBe(2);
  });
});
