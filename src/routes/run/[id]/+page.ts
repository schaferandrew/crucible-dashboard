import { loadRun } from '$lib/data';
import type { PageLoad } from './$types';

// Not prerendered (B-21): there are thousands of runs, and each is one small JSON file read on demand. The
// route is served by adapter-static's SPA fallback (`404.html`), which GitHub Pages returns for any unknown
// path, so `/crucible-dashboard/run/<uuid>/` works as a deep link. See README "Run pages".
export const prerender = false;
export const ssr = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageLoad = async ({ fetch, params }) => {
  // Only a uuid is ever turned into a file name
  if (!UUID.test(params.id)) return { id: params.id, run: null, error: 'That is not a run id.' };
  try {
    return { id: params.id, run: await loadRun(fetch, params.id), error: null };
  } catch (e) {
    return { id: params.id, run: null, error: e instanceof Error ? e.message : String(e) };
  }
};
