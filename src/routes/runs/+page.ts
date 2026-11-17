import { loadIndex } from '$lib/data';
import { loadMonth, loadMonths } from '$lib/pages/runs/data';
import type { PageLoad } from './$types';

// Like the leaderboard: the current suite's index, and the newest month's runs. The months come from
// `recent/index.json`; older ones load on demand.
export const load: PageLoad = async ({ fetch, parent }) => {
  const { meta } = await parent();
  const months = await loadMonths(fetch);
  const first = months[0] ?? null;
  const [index, firstRuns] = await Promise.all([
    loadIndex(fetch, meta.current_suite),
    first ? loadMonth(fetch, first) : Promise.resolve([]),
  ]);
  return { months, index, firstMonth: first, firstRuns };
};
