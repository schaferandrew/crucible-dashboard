// Loading the run times behind the estimates. A task's typical time and a setup's pace need the finished runs
// of each task, which only `<suite>/tasks/<task>.json` carries (the index has per-cell means, not times).
// So the page fetches the files of the section's scored tasks after the first render, once each. A file that
// fails to load leaves that task untimed (the estimate says so) instead of failing the page.

import { base } from '$app/paths';
import { buildTimes, type TaskTimes, type TimeRun } from './shape';

const files = new Map<string, Promise<TimeRun[] | null>>();

function load(fetchFn: typeof fetch, suite: string, task: string): Promise<TimeRun[] | null> {
  const path = `${suite}/tasks/${encodeURIComponent(task)}.json`;
  let p = files.get(path);
  if (!p) {
    p = fetchFn(`${base}/data/${path}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        const runs = (j as { runs?: unknown } | null)?.runs;
        return Array.isArray(runs) ? (runs as TimeRun[]) : null;
      })
      .catch(() => null);
    files.set(path, p);
  }
  return p;
}

export interface LoadedTimes {
  times: TaskTimes;
  /** Task files that could not be read. */
  missing: number;
}

export async function loadTimes(
  fetchFn: typeof fetch,
  suite: string,
  tasks: readonly string[],
): Promise<LoadedTimes> {
  const got = await Promise.all(tasks.map((t) => load(fetchFn, suite, t)));
  const byTask = new Map<string, TimeRun[]>();
  let missing = 0;
  got.forEach((runs, i) => {
    if (runs) byTask.set(tasks[i]!, runs);
    else missing += 1;
  });
  return { times: buildTimes(byTask), missing };
}
