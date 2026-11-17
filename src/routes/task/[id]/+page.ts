import { loadIndex, loadMeta } from '$lib/data';
import { allTaskIds, findElsewhere, loadTaskFile } from '$lib/pages/task/load';
import { resolveTask } from '$lib/pages/task/shape';
import type { EntryGenerator, PageLoad } from './$types';

// B-01: every task of every visible suite is prerendered (for the current suite's view; another suite is read
// from `?suite=` on mount). An alias or an unknown id is not listed here: it is served by the SPA fallback and
// resolved in the browser, so old ids still open the renamed task (TASK-URL-02).
export const entries: EntryGenerator = async () => {
  const ids = await allTaskIds(fetch, await loadMeta(fetch));
  return ids.map((id) => ({ id }));
};

export const load: PageLoad = async ({ fetch, parent, params }) => {
  const { meta } = await parent();
  const index = await loadIndex(fetch, meta.current_suite);
  const task = resolveTask(index.catalog, params.id);
  let file = null;
  let error: string | null = null;
  // A retired task shows a stub, so its file is not needed
  if (task && task.status !== 'retired') {
    try {
      file = await loadTaskFile(fetch, meta.current_suite, task.id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  const elsewhere = task ? [] : await findElsewhere(fetch, meta, meta.current_suite, params.id);
  return { id: params.id, index, file, error, elsewhere };
};
