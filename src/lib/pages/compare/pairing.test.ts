import { describe, expect, it } from 'vitest';
import {
  MAX_TASK_SHARE,
  MIN_PAIRED_TASKS,
  differenceNote,
  outcomeText,
  pairSentence,
  pairedComparison,
  runOutcome,
  variantDiff,
  variantDims,
  type PairRun,
  type PairSide,
} from './pairing';

const fin = (score: number, elapsed = 10, cost = 0.01): PairRun => ({
  outcome: 'finished',
  score,
  elapsed,
  cost,
});
const bad = (outcome: 'timed_out' | 'error'): PairRun => ({ outcome, score: null, elapsed: 99, cost: null });

const id = { model: 'm', weights: 'p|f|q', reasoning: 'default', harness: 'direct' };
function side(runs: Record<string, PairRun[]>, over: Partial<PairSide> = {}): PairSide {
  return {
    identity: id,
    deployment: 'local~x',
    recorded: true,
    costKind: 'electricity',
    runs: new Map(Object.entries(runs)),
    ...over,
  };
}
const tasks = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, name: `Task ${i}` }));
const all = (f: (i: number) => PairRun[]) => Object.fromEntries(tasks.map((t, i) => [t.id, f(i)]));

describe('constants', () => {
  it('keeps the documented thresholds', () => {
    expect(MIN_PAIRED_TASKS).toBe(5);
    expect(MAX_TASK_SHARE).toBe(0.5);
  });
});

describe('outcomes (PAIR-02, PAIR-03)', () => {
  it('classes records and slim runs', () => {
    expect(runOutcome({ outcome: { timed_out: true, status: 'completed' } })).toBe('timed_out');
    expect(runOutcome({ outcome: { status: 'timeout' } })).toBe('timed_out');
    expect(runOutcome({ outcome: { status: 'completed' } })).toBe('finished');
    expect(runOutcome({ outcome: 'finished' })).toBe('finished');
    expect(runOutcome({ outcome: 'timed_out' })).toBe('timed_out');
    expect(runOutcome({ outcome: 'error' })).toBe('error');
    expect(runOutcome({ outcome: { status: 'tool_failure' } })).toBe('error');
    expect(runOutcome(null)).toBe('error');
  });
  it('words them', () => {
    expect(outcomeText({ outcome: 'finished' })).toBe('finished');
    expect(outcomeText({ outcome: { timed_out: true } })).toBe('timed out');
    expect(outcomeText({ outcome: 'error' })).toBe('harness error');
    expect(outcomeText({ outcome: { status: 'tool_failure' } })).toBe('tool failure');
  });
});

describe('what differs (PAIR-07)', () => {
  it('names the answer-changing dimensions (weights read as quant in notes)', () => {
    expect(variantDiff(id, { ...id, model: 'n' })).toEqual(['model']);
    expect(variantDiff(id, { ...id, model: 'n', weights: 'api' })).toEqual(['model', 'weights']);
    expect(variantDiff(id, { ...id, weights: 'p|f|q8' })).toEqual(['weights']);
    expect(variantDiff(id, { ...id, reasoning: 'on', harness: 'pi' })).toEqual(['reasoning', 'harness']);
    expect(variantDims(1)).not.toContain('harness');
    expect(variantDims(2)).toContain('harness');
    expect(differenceNote(['weights', 'reasoning'], true)).toBe(
      "These differ in quant and reasoning: a difference can't be put down to any one of them.",
    );
    expect(differenceNote(['weights'])).toBe('');
  });
  it('is an A/B only with one dimension on the same recorded deployment', () => {
    const a = side(all(() => [fin(5)]));
    const b = side(
      all(() => [fin(6)]),
      { identity: { ...id, reasoning: 'on' } },
    );
    expect(pairedComparison(a, b, tasks, variantDims(1)).ab).toBe(true);
    expect(pairedComparison(a, { ...b, deployment: 'local~y' }, tasks, variantDims(1)).ab).toBe(false);
    expect(pairedComparison(a, { ...b, recorded: false }, tasks, variantDims(1)).ab).toBe(false);
    const c = side(
      all(() => [fin(6)]),
      { identity: { ...id, harness: 'pi' } },
    );
    expect(pairedComparison(a, c, tasks, variantDims(1)).ab).toBe(false);
  });
});

describe('paired tasks and the sentence (PAIR-01, 04, 05, 06)', () => {
  it('scores only tasks both finished; unfinished runs are never scored 0', () => {
    const a = side(all((i) => (i === 0 ? [bad('timed_out')] : [fin(5)])));
    const b = side(all(() => [fin(7)]));
    const p = pairedComparison(a, b, tasks, []);
    expect(p.shared).toHaveLength(8);
    expect(p.paired).toHaveLength(7);
    expect(p.meanDiff).toBeCloseTo(2);
    expect(pairSentence(p, 'A', 'B')).toBe(
      'B scores 2.0 higher than A on average on 7 shared finished tasks.',
    );
  });
  it('says lower, same, and singular', () => {
    const lower = pairedComparison(side(all(() => [fin(8)])), side(all(() => [fin(7.6)])), tasks, []);
    expect(pairSentence(lower, 'A', 'B')).toContain('scores 0.4 lower than A');
    const same = pairedComparison(side(all(() => [fin(8)])), side(all(() => [fin(8.02)])), tasks, []);
    expect(pairSentence(same, 'A', 'B')).toBe('B scores the same as A on 8 shared finished tasks.');
    expect(same.headline.k).toBe(0);
  });
  it('has the no-task sentences', () => {
    const a = side({ t0: [fin(5)] });
    const none = pairedComparison(a, side({ t1: [fin(5)] }), tasks, []);
    expect(pairSentence(none, 'A', 'B')).toBe('No task in common.');
    const dnf = pairedComparison(a, side({ t0: [bad('error')] }), tasks, []);
    expect(pairSentence(dnf, 'A', 'B')).toBe('No task both finished, of the 1 both ran.');
  });
  it('withholds a headline with too few tasks (rule 5)', () => {
    const few = tasks.slice(0, MIN_PAIRED_TASKS - 1);
    const a = side(Object.fromEntries(few.map((t) => [t.id, [fin(5)]])));
    const b = side(Object.fromEntries(few.map((t) => [t.id, [fin(9)]])));
    const p = pairedComparison(a, b, tasks, []);
    expect(p.headline.reason).toBe('few-tasks');
    expect(pairSentence(p, 'A', 'B')).toBe('A and B differ on 4 of 4 shared finished tasks.');
    // exactly the minimum is enough
    const five = tasks.slice(0, MIN_PAIRED_TASKS);
    const p5 = pairedComparison(
      side(Object.fromEntries(five.map((t) => [t.id, [fin(5)]]))),
      side(Object.fromEntries(five.map((t) => [t.id, [fin(9)]]))),
      tasks,
      [],
    );
    expect(p5.headline.allowed).toBe(true);
  });
  it('withholds a headline when one task drives the difference, and names it', () => {
    const a = side(all(() => [fin(5)]));
    const b = side(all((i) => [fin(i === 3 ? 9 : 5.1)]));
    const p = pairedComparison(a, b, tasks, []);
    expect(p.headline.reason).toBe('one-task');
    expect(pairSentence(p, 'A', 'B')).toBe(
      'A and B differ on 8 of 8 shared finished tasks (Task 3 accounts for most of the difference).',
    );
  });
  it('allows a headline when no task passes half of the total', () => {
    const a = side(all(() => [fin(5)]));
    const b = side(all((i) => [fin(5 + (i % 2 ? 1 : 1.5))]));
    expect(pairedComparison(a, b, tasks, []).headline.allowed).toBe(true);
  });
});

describe('speed and cost (PAIR-08, PAIR-09)', () => {
  const a = side(all(() => [fin(5, 10)]));
  const faster = side(
    all((i) => [fin(5, i % 2 ? 5 : 20)]),
    { identity: { ...id, reasoning: 'on' } },
  );
  it('compares two variants on one deployment by the median per-task ratio', () => {
    const p = pairedComparison(a, faster, tasks, variantDims(1));
    expect(p.speed.kind).toBe('variants');
    expect(p.speed.faster).toBe(4);
    expect(p.speed.slower).toBe(4);
    expect(p.speed.ratio).toBeCloseTo(1.25);
    expect(p.cost.comparable).toBe(true);
  });
  it('compares one variant across deployments, but not different variants on different ones', () => {
    const same = pairedComparison(
      a,
      side(a.runs as never, { deployment: 'cloud~x', costKind: 'billed' }),
      tasks,
      [],
    );
    expect(same.speed.kind).toBe('deployments');
    expect(same.cost.comparable).toBe(false);
    const both = pairedComparison(a, { ...faster, deployment: 'local~y' }, tasks, []);
    expect(both.speed.comparable).toBe(false);
    expect(both.speed.reason).toMatch(/can't be put down/);
  });
  it('never compares an unrecorded deployment', () => {
    const p = pairedComparison(a, { ...faster, recorded: false }, tasks, []);
    expect(p.speed.comparable).toBe(false);
    expect(p.cost.comparable).toBe(false);
    expect(p.paired).toHaveLength(8);
  });
});
