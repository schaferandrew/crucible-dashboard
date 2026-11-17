import { describe, expect, it } from 'vitest';
import { syntheticIndex } from '../../../../tests/fixture';
import { asSetupId, asDeploymentId } from '$lib/core/types';
import { viewFor } from '$lib/core/scoring';
import { countedBlocks, coverage, mixedDeployments, overlap, poolCandidates } from './coverage';
import { comparisonCandidates, pickerGroups, resolveCompare, fullLabel } from './resolve';
import { activeTasks, parseCompareQuery, runsBySide } from './sides';

function example() {
  const index = syntheticIndex();
  const source = index.entities.setups['s-pi']!;
  const second = asSetupId('s-pi-second');
  index.entities.setups[second] = {
    ...source,
    id: second,
    deployment: asDeploymentId('cloud~other'),
    provider: 'other',
  };
  const cell = index.cells.find((c) => c.setup === source.id && c.task === 'a1')!;
  index.cells.push({
    ...cell,
    setup: second,
    counted: { ...cell.counted!, n: 3, n_scored: 3, n_finished: 3, mean_finished: 5 },
  });
  const view = viewFor(index, 'agentic');
  const tasks = activeTasks(view);
  const exact = comparisonCandidates(index, view);
  return { index, view, tasks, exact, second };
}

describe('compare coverage and pooling', () => {
  it('counts unique tasks, pools repeats by run count, and never picks the maximum score', () => {
    const { index, exact, tasks } = example();
    const pooled = poolCandidates(exact).find((c) => c.id.startsWith('pool:'))!;
    expect(pooled.members).toHaveLength(2);
    expect(countedBlocks(index, pooled).get('a1')).toMatchObject({ n: 4, n_finished: 4, mean_finished: 6 });
    expect(coverage(index, pooled, tasks)).toEqual({ done: 2, total: 2, attempted: 2, runs: 5 });
    // A repeated member must not count the same source runs twice.
    expect(
      countedBlocks(index, { ...pooled, members: [...pooled.members, ...pooled.members] }).get('a1')!.n,
    ).toBe(4);
    expect(mixedDeployments(pooled)).toBe(true);
  });
  it('unions complementary task coverage across deployments', () => {
    const second = asSetupId('s-pi-second');
    const fresh = syntheticIndex();
    const first = fresh.entities.setups['s-pi']!;
    fresh.entities.setups[second] = { ...first, id: second, deployment: asDeploymentId('cloud~other') };
    fresh.cells = fresh.cells.filter((x) => !(x.setup === first.id && x.task === 'a2'));
    const source = fresh.cells.find((x) => x.setup === first.id)!;
    fresh.cells.push({ ...source, setup: second, task: 'a2' as typeof source.task });
    const view = viewFor(fresh, 'agentic');
    const pooled = comparisonCandidates(fresh, view, true).find((x) => x.id.startsWith('pool:'))!;
    expect(coverage(fresh, pooled, activeTasks(view)).done).toBe(2);
  });
  it('does not combine different formats, quants, reasoning levels or harness combinations', () => {
    const { exact } = example();
    const c = exact[0]!;
    const different = ['format', 'quant', 'reasoning', 'harness'] as const;
    for (const key of different) {
      const member = { ...c.first, [key]: 'different' };
      const other = { ...c, id: 'different', first: member, members: [member] };
      expect(poolCandidates([c, other])).toHaveLength(2);
    }
  });
  it('does not pool variants whose identifying fields were not recorded', () => {
    const { exact } = example();
    const known = exact.find((c) => c.id === 's-pi')!;
    const original = exact.find((c) => c.id === 's-pi-second')!;
    const first = { ...original.first, unrecorded: ['format'] };
    const unknown = { ...original, first, members: [first] };
    expect(poolCandidates([known, unknown])).toHaveLength(2);
  });
  it('shows completion and overlap in the picker and filters incomplete choices', () => {
    const { index, exact, tasks } = example();
    const first = exact.find((c) => c.id === 's-pi')!;
    const other = exact.find((c) => c.id === 's-other')!;
    expect(overlap(index, [first, other], tasks)).toBe(1);
    const groups = pickerGroups(index, exact, [first], tasks);
    expect(groups[0]!.options.find((o) => o.id === other.id)!.text).toContain(
      '1/2 tasks scored · 1 in common',
    );
    expect(pickerGroups(index, exact, [], tasks, true)[0]!.options.map((o) => o.id)).toEqual(['s-pi']);
  });
  it('round-trips pooled identities in the URL and maps an exact selection into its pool', () => {
    const { index, second } = example();
    const r = resolveCompare(index, ['s-pi', second], 'agentic', {}, true);
    expect(r.items).toHaveLength(1);
    expect(r.notes).toEqual([]);
    const id = r.items[0]!.id;
    const q = parseCompareQuery(`?s=${encodeURIComponent(id)}&mode=agentic&pool=1&complete=1`);
    expect(q.pool).toBe(true);
    expect(q.complete).toBe(true);
    const back = resolveCompare(index, q.s, q.mode, {}, q.pool);
    expect(back.items[0]!.id).toBe(id);
    expect(back.notes).toEqual([]);
  });
  it('preserves exact Combined links when pooling is enabled', () => {
    const index = syntheticIndex();
    expect(resolveCompare(index, ['s-chat+s-pi'], 'combined', {}, true).items[0]!.id).toBe('s-chat+s-pi');
  });
  it('keeps source run UUIDs and outcomes while withholding pooled timing and costs', () => {
    const { index, view } = example();
    const pooled = comparisonCandidates(index, view, true).find((c) => c.id.startsWith('pool:'))!;
    const list = runsBySide(
      [pooled],
      new Map([
        [
          'a1',
          [
            {
              run_uuid: 'one',
              setup: 's-pi',
              state: 'counted',
              score: 9,
              outcome: { status: 'completed' },
              elapsed_s: 1,
              tps: 9,
              cost: 1,
            },
            {
              run_uuid: 'two',
              setup: 's-pi-second',
              state: 'counted',
              score: 0,
              outcome: { timed_out: true },
              elapsed_s: 100,
              tps: 1,
              cost: 10,
            },
          ],
        ],
      ]),
    )[0]!.get('a1')!;
    expect(list.map((r) => r.uuid)).toEqual(['one', 'two']);
    expect(list.map((r) => r.outcome)).toEqual(['finished', 'timed_out']);
    expect(list.every((r) => r.elapsed === null && r.tps === null && r.cost === null)).toBe(true);
  });
  it('includes the local format in picker labels', () => {
    const { index, exact } = example();
    const c = exact[0]!;
    const first = {
      ...c.first,
      where: 'local' as const,
      format: 'gguf',
      quant: 'q4',
      labels: { ...c.first.labels },
    };
    expect(fullLabel(index, { ...c, first, members: [first] })).toContain('gguf q4');
  });
});
