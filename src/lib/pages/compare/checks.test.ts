import { describe, expect, it } from 'vitest';
import { checksFromRun } from './checks';

const run = (scores: unknown[], ref = { rubric_version: 2, method: 'checks' }) => ({
  scores,
  suites: { v4: { score_ref: ref } },
});

describe('checksFromRun', () => {
  it('uses the score record the suite used and groups its items', () => {
    const r = checksFromRun(
      run([
        { rubric_version: 1, method: 'checks', items: [{ label: 'old', passed: true }] },
        {
          rubric_version: 2,
          method: 'checks',
          items: [
            { label: 'a', passed: true },
            { label: 'b', passed: false, detail: 'wrong', group: 'g' },
            { id: 'c' },
          ],
        },
      ]),
      'v4',
    );
    expect(r.empty).toBeNull();
    expect(r.groups).toEqual([
      {
        name: null,
        items: [
          { label: 'a', passed: true, detail: null },
          { label: 'c', passed: null, detail: null },
        ],
      },
      { name: 'g', items: [{ label: 'b', passed: false, detail: 'wrong' }] },
    ]);
  });
  it('falls back to group totals, then to a message', () => {
    expect(
      checksFromRun(
        run([{ rubric_version: 2, method: 'checks', groups: [{ id: 'x', passed: 2, total: 3 }] }]),
        'v4',
      ).lines,
    ).toEqual(['2/3 x']);
    expect(checksFromRun(run([{ rubric_version: 2, method: 'checks' }]), 'v4').empty).toMatch(/No per-check/);
    expect(checksFromRun(run([]), 'v4').empty).toBe('No score record for this run.');
    expect(checksFromRun(null, 'v4').empty).toBe('No score record for this run.');
  });
});
