import { loadIndex } from '$lib/data';
import type { PageLoad } from './$types';

// Only the current suite is loaded here (a query string is not available while prerendering): the prerendered
// page is the empty "pick two to four setups" state. The URL is read on mount; another suite is fetched when asked for.
export const load: PageLoad = async ({ fetch, parent }) => {
  const { meta } = await parent();
  return { index: await loadIndex(fetch, meta.current_suite) };
};
