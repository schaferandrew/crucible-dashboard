/** The document title helper: `Leaderboard · Crucible`. A page that is the site root passes just `Crucible`. */
export const SITE = 'Crucible';

export function documentTitle(page?: string | null): string {
  const p = (page ?? '').trim();
  return !p || p === SITE ? SITE : `${p} · ${SITE}`;
}
