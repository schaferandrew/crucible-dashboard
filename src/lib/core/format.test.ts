import { describe, expect, it } from 'vitest';
import {
  fmtCost,
  fmtDate,
  fmtInt,
  fmtRepeat,
  fmtScore,
  fmtSeconds,
  fmtTps,
  fmtUsd,
  heatStyle,
  listPhrase,
  tpsTitle,
} from './format';

describe('format', () => {
  it('scores to one decimal, dash when unknown', () => {
    expect(fmtScore(7.46)).toBe('7.5');
    expect(fmtScore(null)).toBe('—');
  });
  it('seconds', () => {
    expect(fmtSeconds(4.25)).toBe('4.3s');
    expect(fmtSeconds(42.4)).toBe('42s');
    expect(fmtSeconds(185)).toBe('3m 05s');
    expect(fmtSeconds(3720)).toBe('1h 02m');
    expect(fmtSeconds(undefined)).toBe('—');
  });
  it('usd', () => {
    expect(fmtUsd(0)).toBe('$0');
    expect(fmtUsd(0.00001)).toBe('<$0.0001');
    expect(fmtUsd(0.00055)).toBe('$0.00055');
    expect(fmtUsd(0.071)).toBe('$0.071');
    expect(fmtUsd(12.345)).toBe('$12.35');
    expect(fmtCost(0.00055, true)).toBe('≈$0.00055');
    expect(fmtCost(null, true)).toBe('—');
  });
  it('numbers use a fixed locale', () => {
    expect(fmtInt(1234567)).toBe('1,234,567');
  });
  it('dates are the ISO date part', () => {
    expect(fmtDate('2026-10-31T23:59:59Z')).toBe('2026-10-31');
    expect(fmtDate(null)).toBe('—');
  });
  it('repeats, tok/s and list phrases', () => {
    expect(fmtRepeat({ n: 1, min: 7, max: 7 })).toBe('1 run');
    expect(fmtRepeat({ n: 3, min: 7, max: 7 })).toBe('3 runs, all 7.0');
    expect(fmtRepeat({ n: 3, min: 6, max: 8 })).toBe('3 runs, 6.0–8.0');
    expect(fmtTps(7.25)).toBe('7.3 tok/s');
    expect(fmtTps(158.05, true)).toBe('158');
    expect(tpsTitle({ n: 0 })).toMatch(/wasn't recorded/);
    expect(listPhrase(['a'])).toBe('a');
    expect(listPhrase(['a', 'b'])).toBe('a and b');
    expect(listPhrase(['a', 'b', 'c'])).toBe('a, b and c');
  });
  it('heat colour runs light to dark', () => {
    expect(heatStyle(null)).toBe('');
    expect(heatStyle(0)).toContain('rgb(234,242,251)');
    expect(heatStyle(10)).toContain('rgb(24,86,163)');
    expect(heatStyle(10)).toContain('#fff');
  });
});
