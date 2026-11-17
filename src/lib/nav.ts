/** The Crucible tab strip. `path` is relative to the app base. */
export const NAV = [
  { id: 'leaderboard', label: 'Leaderboard', path: '/' },
  { id: 'task', label: 'Tasks', path: '/task/' },
  { id: 'model', label: 'Models', path: '/model/' },
  { id: 'compare', label: 'Compare', path: '/compare/' },
  { id: 'runs', label: 'Runs', path: '/runs/' },
  { id: 'todo', label: 'What to run next', path: '/todo/' },
  { id: 'about', label: 'About', path: '/about/' },
] as const;

export type NavId = (typeof NAV)[number]['id'];

/** Which tab a path (relative to the base) belongs to: the longest nav path that prefixes it. `/run/<id>/` belongs to Runs. */
export function navFor(here: string): NavId {
  if (here.startsWith('/run/')) return 'runs';
  return (
    NAV.filter((n) => (n.path === '/' ? here === '/' : here.startsWith(n.path))).at(-1)?.id ?? 'leaderboard'
  );
}
