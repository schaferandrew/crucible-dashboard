// Compare picks (MAIN-TRAY-02/03): up to four setups ticked on the leaderboard, kept in sessionStorage for
// the tab. A fifth pick drops the oldest. Picks survive section, suite and filter changes, so picks of setups
// the filters hide stay in the tray. Storage failures are swallowed.

const KEY = 'crucible-compare';
export const MAX_PICKS = 4;

export function parsePicks(raw: string | null): string[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-MAX_PICKS) : [];
  } catch {
    return [];
  }
}

/** Toggle `id` in a pick list, newest last, never more than MAX_PICKS. */
export function togglePick(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return [...ids, id].slice(-MAX_PICKS);
}

export class Picks {
  ids = $state<string[]>([]);

  /** Call from `onMount` (sessionStorage does not exist while prerendering). */
  load(): void {
    try {
      this.ids = parsePicks(sessionStorage.getItem(KEY));
    } catch {
      /* none */
    }
  }

  #save(): void {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(this.ids));
    } catch {
      /* not remembered */
    }
  }

  has(id: string): boolean {
    return this.ids.includes(id);
  }

  toggle(id: string): void {
    this.ids = togglePick(this.ids, id);
    this.#save();
  }

  clear(): void {
    this.ids = [];
    this.#save();
  }
}
