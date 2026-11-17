import { modelEntries } from '$lib/pages/model/entries';
import { loadModelRuns } from '$lib/pages/model/runs';
import { loadIndex } from '$lib/data';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = modelEntries;

export const load: PageLoad = async ({ fetch, parent, params }) => {
  const { meta } = await parent();
  const model = `${params.maker}/${params.name}`;
  const index = await loadIndex(fetch, meta.current_suite);
  const known = (i: typeof index) => !!i.entities.models[model] || !!i.other[model];
  let found = known(index);
  // A model only a past suite has still gets its page (its suite is one click away)
  for (const s of meta.suites) {
    if (found) break;
    if (s.id !== meta.current_suite) found = known(await loadIndex(fetch, s.id));
  }
  const runs = found ? await loadModelRuns(fetch, meta.current_suite, model).catch(() => null) : null;
  return { index, model, found, runs };
};
