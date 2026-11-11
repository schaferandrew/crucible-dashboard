import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pickSuite, shapeRun } from './shape';

const local = {
  run_uuid: '11111111-2222-3333-4444-555555555555',
  cost: 0.001,
  outcome: 'finished',
  output: 'outputs/x.txt',
  resolution: {
    model: 'nvidia/nemo',
    maker: 'nvidia',
    packager: 'nvidia',
    quant: 'q4_k_m',
    format: 'gguf',
    harness: 'pi',
    reasoning: 'on',
    provider: 'lmstudio',
    where: 'local',
    hardware_key: 'm5-pro-48gb',
    machine: 'Duskfall',
    notes: ['recorded as model nemo; corrected to nvidia/nemo: local key without the maker'],
    sources: { format_from: 'quant' },
  },
  summary: {
    elapsed_s: 335.6,
    started_at: '2026-11-04T17:20:30+00:00',
    harness: { id: 'pi', version: '1.4.0' },
    hardware: { key: 'm5-pro-48gb' },
    metrics: {
      tokens_in: 100,
      tokens_out: 2000,
      output_tokens_per_s: 54,
      tool_calls: 3,
      reasoning_chars: 10,
    },
    task: { id: 'react-lead-form', version: 1 },
    provenance: { crucible_version: '3.7.4' },
    outcome: { status: 'completed', timed_out: false },
  },
  scores: [
    {
      method: 'hidden_tests',
      rubric_version: 2,
      score: 5.1,
      raw: { passed: 22, total: 43, unit: 'tests' },
      capped_at: null,
      items: [
        { group: 'g1', label: 'builds', passed: true, detail: null },
        { group: 'g1', id: 'x', passed: false, detail: 'boom' },
      ],
    },
  ],
  status: [
    { at: '2026-11-05T00:00:00Z', by: 'm', invalid: { reason: 'oops' } },
    { at: '2026-11-04T00:00:00Z', by: 'm', valid: true },
  ],
  suites: {
    v3: {
      state: 'older',
      task: 'react-lead-form',
      score: 5.1,
      score_ref: { method: 'hidden_tests', rubric_version: 2 },
      setup: 's',
      siblings: [],
      scored_run: null,
    },
    v4: {
      state: 'counted',
      task: 'react-lead-form',
      score: 5.1,
      score_ref: { method: 'hidden_tests', rubric_version: 2 },
      setup: 's',
      scored_run: 'aaaaaaaa-0000-0000-0000-000000000000',
      siblings: [
        {
          run_uuid: 'aaaaaaaa-0000-0000-0000-000000000000',
          started_at: '2026-11-06T00:00:00Z',
          state: 'counted',
          score: 7,
          outcome: 'finished',
        },
      ],
    },
  },
};

describe('run page data shaping (B-21, spec 5.2)', () => {
  it('picks the URL suite, else current, else first', () => {
    expect(pickSuite(local, 'v3', 'v4')).toBe('v3');
    expect(pickSuite(local, 'nope', 'v4')).toBe('v4');
    expect(pickSuite(local, null, 'zz')).toBe('v3');
    expect(pickSuite({}, null, 'v4')).toBeNull();
  });

  const v = shapeRun(local, { suite: 'v4', currentSuite: 'v4' });

  it('score sentence from the score record', () => {
    expect(v.score.sentence).toBe('22 of 43 tests passed → 5.1');
    expect(v.score.methodText).toBe('by hidden_tests (rubric version 2)');
    expect(v.standingLine).toBe('Counts in this suite.');
    expect(v.outcome.label).toBe('Finished');
  });
  it('measures: time, tokens, tok/s, cost with its kind', () => {
    const m = Object.fromEntries(v.measures.map((f) => [f.label, f.value]));
    expect(m.Time).toBe('5m 36s');
    expect(m.Tokens).toBe('100 in · 2,000 out');
    expect(m['Decode speed']).toBe('54 tok/s');
    expect(m.Cost).toBe('≈$0.0010 (electricity estimate)');
    expect(m['Tool calls']).toBe('3');
  });
  it('setup facts: format source, hardware class with machine credit, model link', () => {
    const s = Object.fromEntries(v.setup.map((f) => [f.label, f.value]));
    expect(s.Format).toBe('gguf (read from the quant)');
    expect(s['Hardware class']).toBe('m5-pro-48gb (Duskfall)');
    expect(s.Harness).toBe('pi 1.4.0');
    expect(v.setup.find((f) => f.label === 'Model')!.to).toEqual({ kind: 'model', id: 'nvidia/nemo' });
    expect(v.notes).toHaveLength(1);
  });
  it('checks grouped, with labels falling back to ids', () => {
    expect(v.checks.groups[0]!.items.map((i) => [i.label, i.passed, i.detail])).toEqual([
      ['builds', true, null],
      ['x', false, 'boom'],
    ]);
  });
  it('status history is oldest first', () => {
    expect(v.statusHistory.map((s) => s.text)).toEqual(['Marked valid', 'Marked invalid: oops']);
  });
  it('siblings include this run, newest first, with the scored run marked', () => {
    expect(v.siblings.map((s) => [s.uuid.slice(0, 4), s.self, s.scored])).toEqual([
      ['aaaa', false, true],
      ['1111', true, false],
    ]);
  });
  it('per-suite standings', () => {
    expect(v.suites.map((s) => [s.suite, s.state])).toEqual([
      ['v3', 'older'],
      ['v4', 'counted'],
    ]);
    expect(shapeRun(local, { suite: 'v3' }).standingLine).toMatch(/older version/);
  });
  it('survives a run with no score, no suites and junk', () => {
    for (const raw of [null, {}, { run_uuid: 5, scores: 'x', suites: [] }, { ...local, scores: [] }]) {
      expect(() => shapeRun(raw)).not.toThrow();
    }
    const none = shapeRun({ ...local, scores: [] });
    expect(none.score.sentence).toBe('Not scored.');
    expect(none.checks.empty).toMatch(/no score record/);
  });
  it('a cloud run reports billed cost and routing', () => {
    const c = shapeRun({
      ...local,
      resolution: { ...local.resolution, where: 'cloud', provider: 'openrouter' },
      summary: {
        ...local.summary,
        metrics: { cost_source: 'openrouter_billed' },
        endpoint: { upstream: { name: 'OpenAI' } },
      },
    });
    expect(c.measures.find((f) => f.label === 'Cost')!.value).toBe('$0.0010 (billed by the provider)');
    expect(c.setup.find((f) => f.label === 'Provider')!.value).toBe('openrouter, routed to OpenAI');
  });
  it('shapes every real run file without throwing', () => {
    const dir = new URL('../../../../static/data/runs/', import.meta.url);
    const probe = new URL('000267e7-e76c-45bf-8f03-6309f5c61d5a.json', dir);
    if (!existsSync(probe)) return;
    const real = shapeRun(JSON.parse(readFileSync(probe, 'utf8')), { suite: 'v4' });
    expect(real.score.sentence).toBe('22 of 43 tests passed → 5.1');
    expect(real.task.name).toBe('React lead form');
  });
});
