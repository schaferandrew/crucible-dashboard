// Loading for the task pages: a task's file (per-run groups and tokens included) and the other suites' catalogs
// (for "it exists in…"). Build time reads static/data from disk, the browser fetches.

import type { Meta } from '$lib/core/types';
import { loadIndex, loadTask } from '$lib/data';
import { parseTaskFile, resolveTask, taskName, type TaskFile } from './shape';

type Fetch = typeof fetch;

const files = new Map<string, Promise<TaskFile>>();

/** The parsed task file (shared cached `loadTask`). `taskId` is a catalog id (never an alias). */
export function loadTaskFile(fetchFn: Fetch, suite: string, taskId: string): Promise<TaskFile> {
  const key = `${suite}/${taskId}`;
  let p = files.get(key);
  if (!p) {
    p = loadTask(fetchFn, suite, taskId).then((raw) => {
      const f = parseTaskFile(raw, suite);
      if (!f) throw new Error(`${suite}/tasks/${taskId}.json has no task`);
      return f;
    });
    p.catch(() => files.delete(key));
    files.set(key, p);
  }
  return p;
}

export interface Elsewhere {
  suite: string;
  label: string;
  /** The catalog id of the task in that suite. */
  taskId: string;
  name: string;
}

/** The other visible suites that list this id (or an alias of it) (TASK-MISSING-01). */
export async function findElsewhere(
  fetchFn: Fetch,
  meta: Meta,
  excludeSuite: string,
  id: string,
): Promise<Elsewhere[]> {
  const out: Elsewhere[] = [];
  for (const s of meta.suites) {
    if (s.id === excludeSuite) continue;
    try {
      const t = resolveTask((await loadIndex(fetchFn, s.id)).catalog, id);
      if (t) out.push({ suite: s.id, label: s.label, taskId: t.id, name: taskName(t) });
    } catch {
      /* a suite that fails to load is just not listed */
    }
  }
  return out;
}

/** Every task id of every visible suite, for prerendering (build time only). */
export async function allTaskIds(fetchFn: Fetch, meta: Meta): Promise<string[]> {
  const ids = new Set<string>();
  for (const s of meta.suites) {
    try {
      for (const t of (await loadIndex(fetchFn, s.id)).catalog.tasks) ids.add(t.id);
    } catch {
      /* skip */
    }
  }
  return [...ids];
}
