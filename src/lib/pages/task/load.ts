// Loading for the task pages: a task's file, the other suites' catalogs (for "it exists in…"), and the run
// files behind the per-check results. Build time reads static/data from disk, the browser fetches.

import { base } from '$app/paths';
import type { Meta } from '$lib/core/types';
import { loadIndex } from '$lib/data';
import { parseRunDetail, parseTaskFile, resolveTask, taskName, type RunDetail, type TaskFile } from './shape';

type Fetch = typeof fetch;

async function readJson(path: string, fetchFn: Fetch): Promise<unknown> {
  if (import.meta.env.SSR) {
    const [{ readFile }, { resolve }] = await Promise.all([import('node:fs/promises'), import('node:path')]);
    return JSON.parse(await readFile(resolve('static/data', path), 'utf8'));
  }
  const res = await fetchFn(`${base}/data/${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

const files = new Map<string, Promise<TaskFile>>();

/** `<suite>/tasks/<task>.json`, once per page load. `taskId` is a catalog id (never an alias). */
export function loadTaskFile(fetchFn: Fetch, suite: string, taskId: string): Promise<TaskFile> {
  const key = `${suite}/${taskId}`;
  let p = files.get(key);
  if (!p) {
    p = readJson(`${suite}/tasks/${encodeURIComponent(taskId)}.json`, fetchFn).then((raw) => {
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

const details = new Map<string, Promise<RunDetail>>();

/** One run's per-check results and tokens, from its run file (cached). */
export function loadRunDetail(fetchFn: Fetch, uuid: string, suite: string): Promise<RunDetail> {
  const key = `${suite}/${uuid}`;
  let p = details.get(key);
  if (!p) {
    p = readJson(`runs/${encodeURIComponent(uuid)}.json`, fetchFn).then((raw) => parseRunDetail(raw, suite));
    p.catch(() => details.delete(key));
    details.set(key, p);
  }
  return p;
}

/** Load many run details, a few at a time. Failures are reported, not thrown. */
export async function loadRunDetails(
  fetchFn: Fetch,
  uuids: readonly string[],
  suite: string,
  onEach: (uuid: string, d: RunDetail | null) => void,
  concurrency = 6,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < uuids.length) {
      const uuid = uuids[next++]!;
      try {
        onEach(uuid, await loadRunDetail(fetchFn, uuid, suite));
      } catch {
        onEach(uuid, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, uuids.length) }, worker));
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
