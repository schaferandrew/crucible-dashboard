// How a run ended, in three classes: the single definition every page uses (B-06).

export type OutcomeClass = 'finished' | 'timeout' | 'error';

export const OUTCOME_CLASSES: readonly OutcomeClass[] = ['finished', 'timeout', 'error'];

export const OUTCOME_LABEL: Record<OutcomeClass, string> = {
  finished: 'Finished',
  timeout: 'Timed out',
  error: 'Error',
};

/** `timed_out` (or a timeout status) is a timeout, `finished` (or completed) finished, anything else is an error. */
export function outcomeClass(outcome: string | null | undefined): OutcomeClass {
  const o = (outcome ?? '').toLowerCase();
  if (o === 'finished' || o === 'completed' || o === 'ok') return 'finished';
  if (o === 'timed_out' || o === 'timeout') return 'timeout';
  return 'error';
}
