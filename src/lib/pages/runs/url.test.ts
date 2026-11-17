import { describe, expect, it } from 'vitest';
import { parseRunsUrl, runsSearch } from './url';

describe('shareable Runs choices', () => {
  it('restores a filtered link, including the failed alias used by the handoff', () => {
    expect(parseRunsUrl('?suite=v3&outcome=failed&state=invalid&sort=oldest')).toEqual({
      filters: { outcome: 'error', state: 'invalid' },
      sort: 'oldest',
    });
    expect(parseRunsUrl('?outcome=timed_out&state=future_state&sort=score-high')).toEqual({
      filters: { outcome: 'timeout', state: 'future_state' },
      sort: 'score-high',
    });
  });
  it('falls back for unreadable choices', () => {
    expect(parseRunsUrl('?outcome=oops&sort=oops')).toEqual({
      filters: { outcome: 'all', state: 'all' },
      sort: 'newest',
    });
  });
  it('keeps context and unrelated params when choices change or reset', () => {
    const search = runsSearch('?suite=v3&mode=chat&hw=m5&extra=keep', {
      filters: { outcome: 'error', state: 'invalid' },
      sort: 'oldest',
    });
    expect(parseRunsUrl(search)).toEqual({ filters: { outcome: 'error', state: 'invalid' }, sort: 'oldest' });
    expect(runsSearch(search, { filters: { outcome: 'all', state: 'all' }, sort: 'newest' })).toBe(
      'suite=v3&mode=chat&hw=m5&extra=keep',
    );
  });
});
