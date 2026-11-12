// Monthly shards (`recent/<YYYY-MM>.json`): read from disk at build time, fetched in the browser; once each.
import { base } from '$app/paths';
import { monthsOfIndex, normalizeShard, type SlimRun } from './shape';

/** Every month that has a shard, newest first, from `recent/index.json`. */
export async function loadMonths(fetchFn: typeof fetch): Promise<string[]> {
  if (import.meta.env.SSR) {
    const [{ readFile }, { resolve }] = await Promise.all([import('node:fs/promises'), import('node:path')]);
    return monthsOfIndex(JSON.parse(await readFile(resolve('static/data/recent/index.json'), 'utf8')));
  }
  const res = await fetchFn(`${base}/data/recent/index.json`);
  if (!res.ok) throw new Error(`recent/index.json: ${res.status} ${res.statusText}`);
  return monthsOfIndex(await res.json());
}

const shards = new Map<string, Promise<SlimRun[]>>();

export function loadMonth(fetchFn: typeof fetch, month: string): Promise<SlimRun[]> {
  let p = shards.get(month);
  if (!p) {
    p = (async () => {
      if (import.meta.env.SSR) {
        const [{ readFile }, { resolve }] = await Promise.all([
          import('node:fs/promises'),
          import('node:path'),
        ]);
        const file = resolve('static/data/recent', `${month}.json`);
        return normalizeShard(JSON.parse(await readFile(file, 'utf8')));
      }
      const res = await fetchFn(`${base}/data/recent/${month}.json`);
      if (!res.ok) throw new Error(`recent/${month}.json: ${res.status} ${res.statusText}`);
      return normalizeShard(await res.json());
    })();
    p.catch(() => shards.delete(month));
    shards.set(month, p);
  }
  return p;
}
