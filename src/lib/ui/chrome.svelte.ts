// Small shared UI state the shell reads: the suite the reader is looking at (so the tab strip and breadcrumbs
// keep `?suite=` on their links, NAV-03 / ROUTE-08) and the previous in-app page (so Back can return to it).

import { goto } from '$app/navigation';
import { base } from '$app/paths';

export const chrome = $state<{
  /** A suite other than the current one, or null. Pages set it through ContextState / `useSuite`. */
  suite: string | null;
  /** The URL of the previous page inside the app, or null on a deep link. */
  previous: string | null;
}>({ suite: null, previous: null });

/** Back: to the previous in-app page with its query intact, else to `fallback` (default the leaderboard). */
export async function goBack(fallback = '/'): Promise<void> {
  if (chrome.previous) history.back();
  else await goto(base + fallback);
}
