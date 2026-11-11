// Loading site data. At build time (prerender and dev SSR) files are read from static/data on disk, so the
// page is rendered with its data and nothing is inlined into the HTML twice; in the browser they are fetched
// from <base>/data/. The core never sees raw JSON: everything goes through the tolerant normalizers.

import { base } from '$app/paths';
import { normalizeIndex, normalizeMeta } from '$lib/core/normalize';
import type { Meta, SuiteId, SuiteIndex } from '$lib/core/types';

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
