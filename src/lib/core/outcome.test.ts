import { describe, expect, it } from 'vitest';
import { OUTCOME_CLASSES, OUTCOME_LABEL, outcomeClass } from './outcome';

describe('outcome classes (B-06)', () => {
  it('finished, timeout; anything unknown is an error', () => {
    for (const o of ['finished', 'completed', 'ok', 'FINISHED']) expect(outcomeClass(o)).toBe('finished');
    for (const o of ['timed_out', 'timeout']) expect(outcomeClass(o)).toBe('timeout');
    for (const o of ['error', 'harness_error', 'weird', '', null, undefined])
      expect(outcomeClass(o)).toBe('error');
  });
  it('every class has a label', () => {
    for (const c of OUTCOME_CLASSES) expect(OUTCOME_LABEL[c]).toBeTruthy();
  });
});
