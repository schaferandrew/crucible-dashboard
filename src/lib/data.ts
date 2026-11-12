// Loading site data. At build time (prerender and dev SSR) files are read from static/data on disk, so the
// page is rendered with its data and nothing is inlined into the HTML twice; in the browser they are fetched
// from <base>/data/. The core never sees raw JSON: everything goes through the tolerant normalizers.

import { base } from '$app/paths';
import { normalizeIndex, normalizeMeta } from '$lib/core/normalize';
import { buildRunLinkIndex, type RunLinkIndex } from '$lib/core/runlink';
import type { CellRuns, Meta, RunId, RunSuiteEntry, SuiteId, SuiteIndex } from '$lib/core/types';

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

export async function loadMeta(fetchFn: Fetch): Promise<Meta> {
  return normalizeMeta(await readJson('meta.json', fetchFn));
}

const indexes = new Map<string, Promise<SuiteIndex>>();
const loadedIndexes = new Map<string, SuiteIndex>();

/** A suite's index if some page already loaded it (free), else null. For pages that only want nicer labels. */
export function cachedIndex(suite: SuiteId | string): SuiteIndex | null {
  return loadedIndexes.get(suite) ?? null;
}

/** A suite's index.json, once per page load. */
export function loadIndex(fetchFn: Fetch, suite: SuiteId | string): Promise<SuiteIndex> {
  let p = indexes.get(suite);
  if (!p) {
    p = readJson(`${suite}/index.json`, fetchFn)
      .then(normalizeIndex)
      .then((idx) => (loadedIndexes.set(suite, idx), idx));
    p.catch(() => indexes.delete(suite));
    indexes.set(suite, p);
  }
  return p;
}

const lazy = new Map<string, Promise<unknown>>();
function once<T>(path: string, fetchFn: Fetch): Promise<T> {
  let p = lazy.get(path);
  if (!p) {
    p = readJson(path, fetchFn);
    p.catch(() => lazy.delete(path));
    lazy.set(path, p);
  }
  return p as Promise<T>;
}

/** The scored run of every cell of a suite. Not needed for the first view; loaded when a cell is opened. */
export function loadCellRuns(fetchFn: Fetch, suite: SuiteId | string): Promise<CellRuns> {
  return once<CellRuns>(`${suite}/cell-runs.json`, fetchFn);
}

/** `<suite>/tasks/<task>.json` (raw), once per page load. `task` is a catalog id, never an alias. */
export function loadTask(fetchFn: Fetch, suite: SuiteId | string, task: string): Promise<unknown> {
  return once(`${suite}/tasks/${encodeURIComponent(task)}.json`, fetchFn);
}

/** One run's detail file (siblings and scored run per suite included). */
export function loadRun(
  fetchFn: Fetch,
  uuid: string,
): Promise<{ run_uuid: string; suites?: Record<string, RunSuiteEntry> } & Record<string, unknown>> {
  return once(`runs/${uuid}.json`, fetchFn);
}

/** A run's model output (`outputs/<uuid>.txt`), fetched only when the reader opens the disclosure (RUNDETAIL-10). */
export async function loadOutput(fetchFn: Fetch, ref: string): Promise<string> {
  const res = await fetchFn(`${base}/data/${ref.replace(/^\/+/, '')}`);
  if (!res.ok) throw new Error(`${ref}: ${res.status} ${res.statusText}`);
  return res.text();
}

const runLinkIndexes = new Map<string, Promise<RunLinkIndex>>();

/**
 * The run a matrix cell opens (B-21): the scored run of `setup` x `task` in `suite`, from the lazily fetched
 * `cell-runs.json`, or null when that cell has no run. The first call per suite fetches the file (about 90 KB
 * gzip-able JSON, not part of the first load); later calls are a Map lookup. Link with `runHref(uuid)`.
 */
export async function runLinkFor(
  fetchFn: Fetch,
  suite: SuiteId | string,
  setup: string,
  task: string,
): Promise<RunId | null> {
  let p = runLinkIndexes.get(suite);
  if (!p) {
    p = loadCellRuns(fetchFn, suite).then(buildRunLinkIndex);
    p.catch(() => runLinkIndexes.delete(suite));
    runLinkIndexes.set(suite, p);
  }
  return (await p).get(setup, task);
}
