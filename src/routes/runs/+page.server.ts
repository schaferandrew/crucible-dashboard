// The list of monthly shards, read once at build time (a browser cannot list a folder). Prerendered into
// `__data.json`, so a client-side visit knows the months too.
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { orderMonths } from '$lib/pages/runs/shape';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const files = await readdir(resolve('static/data/recent'));
  const names = files.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5));
  return { months: orderMonths(names) };
};
