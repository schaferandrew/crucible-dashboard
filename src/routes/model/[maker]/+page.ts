import { makerPageEntries } from '$lib/pages/model/entries';
import { findMaker } from '$lib/pages/model/shape';
import { loadIndex } from '$lib/data';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = makerPageEntries;

export const load: PageLoad = async ({ fetch, parent, params }) => {
  const { meta } = await parent();
  const index = await loadIndex(fetch, meta.current_suite);
  // A hand-typed URL matches without regard to case; one that matches nothing falls back to the index
  const maker = findMaker(index, params.maker);
  return { index, maker, asked: params.maker };
};
