// Turning a setup x task into the run its matrix cell opens (B-21), from `<suite>/cell-runs.json`.
// The cell shows the mean of its repeats; the link goes to the run the leaderboard scores (the most recent
// counted run), and that run's page lists the cell's other runs as siblings.

import type { CellRuns, RunId, SetupId, TaskId } from './types';

export interface RunLinkIndex {
  /** setup -> task -> run uuid */
  get(setup: SetupId | string, task: TaskId | string): RunId | null;
  readonly size: number;
}

/** Index a cell-runs table. Rows that point outside its own `setups` / `tasks` tables are ignored. */
export function buildRunLinkIndex(cr: Pick<CellRuns, 'setups' | 'tasks' | 'runs'>): RunLinkIndex {
  const bySetup = new Map<string, Map<string, RunId>>();
  let size = 0;
  for (const row of cr.runs ?? []) {
    const [si, ti, run] = row;
    const setup = cr.setups?.[si];
    const task = cr.tasks?.[ti];
    if (!setup || !task || !run) continue;
    let m = bySetup.get(setup);
    if (!m) bySetup.set(setup, (m = new Map()));
    if (!m.has(task)) size++;
    m.set(task, run);
  }
  return {
    get: (setup, task) => bySetup.get(setup)?.get(task) ?? null,
    size,
  };
}
