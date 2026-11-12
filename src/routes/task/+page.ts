import { loadIndex } from '$lib/data';
import type { PageLoad } from './$types';

// The index of the current suite is prerendered; another suite is fetched when the reader picks it.
export const load: PageLoad = async ({ fetch, parent }) => {
  const { meta } = await parent();
  return { index: await loadIndex(fetch, meta.current_suite) };
};
