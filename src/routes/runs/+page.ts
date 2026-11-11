import { loadIndex } from '$lib/data';
import { loadMonth } from '$lib/pages/runs/data';
import type { PageLoad } from './$types';

// Like the leaderboard: the current suite's index, and the newest month's runs. Older months load on demand.
export const load: PageLoad = async ({ fetch, parent, data }) => {
  const { meta } = await parent();
  const first = data.months[0] ?? null;
  const [index, firstRuns] = await Promise.all([
    loadIndex(fetch, meta.current_suite),
    first ? loadMonth(fetch, first) : Promise.resolve([]),
  ]);
  return { months: data.months, index, firstMonth: first, firstRuns };
};
