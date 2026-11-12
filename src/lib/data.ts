// Loading site data. At build time (prerender and dev SSR) files are read from static/data on disk, so the
// page is rendered with its data and nothing is inlined into the HTML twice; in the browser they are fetched
// from <base>/data/. The core never sees raw JSON: everything goes through the tolerant normalizers.

import { base } from '$app/paths';
import { normalizeIndex, normalizeMeta } from '$lib/core/normalize';
import type { CellRuns, Meta, RunSuiteEntry, SuiteId, SuiteIndex } from '$lib/core/types';

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

/** A suite's index.json, once per page load. */
export function loadIndex(fetchFn: Fetch, suite: SuiteId | string): Promise<SuiteIndex> {
  let p = indexes.get(suite);
  if (!p) {
    p = readJson(`${suite}/index.json`, fetchFn).then(normalizeIndex);
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

/** One run's detail file (siblings and scored run per suite included). */
export function loadRun(
  fetchFn: Fetch,
  uuid: string,
): Promise<{ run_uuid: string; suites?: Record<string, RunSuiteEntry> } & Record<string, unknown>> {
  return once(`runs/${uuid}.json`, fetchFn);
}
