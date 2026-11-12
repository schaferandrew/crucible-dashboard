// Is the viewport at least 640 px wide? null until mounted (prerender and first paint draw both layouts and
// CSS shows the right one, as ResponsiveTable does). Only one layout is in the DOM once mounted (MAIN-RESP-01).

import { CARD_QUERY } from '$lib/ui/table';

export class Wide {
  value = $state<boolean | null>(null);

  /** Call from `onMount`; returns the cleanup. */
  mount(): () => void {
    const mq = matchMedia(CARD_QUERY);
    this.value = mq.matches;
    const on = (e: MediaQueryListEvent) => (this.value = e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }
}
