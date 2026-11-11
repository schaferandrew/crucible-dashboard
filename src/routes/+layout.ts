import { loadMeta } from '$lib/data';
import type { LayoutLoad } from './$types';

// The whole site is prerendered; the leaderboard's default view is in the HTML before any JSON is fetched.
export const prerender = true;
export const trailingSlash = 'always';

export const load: LayoutLoad = async ({ fetch }) => ({ meta: await loadMeta(fetch) });
