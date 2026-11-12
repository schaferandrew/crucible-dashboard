import { loadIndex } from '$lib/data';
import type { PageLoad } from './$types';

// Only the current suite is loaded here (a query string is not available while prerendering). Another
// suite is fetched on demand when the reader picks it.
export const load: PageLoad = async ({ fetch, parent }) => {
  const { meta } = await parent();
  return { index: await loadIndex(fetch, meta.current_suite) };
};
