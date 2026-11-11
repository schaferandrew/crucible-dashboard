/** The Crucible tab strip (one source for the nav and the placeholder pages). `path` is relative to the base. */
export const NAV = [
  { id: 'leaderboard', label: 'Leaderboard', path: '/' },
  { id: 'task', label: 'Tasks', path: '/task/' },
  { id: 'model', label: 'Models', path: '/model/' },
  { id: 'compare', label: 'Compare', path: '/compare/' },
  { id: 'runs', label: 'Runs', path: '/runs/' },
  { id: 'todo', label: 'What to run next', path: '/todo/' },
  { id: 'about', label: 'About', path: '/about/' },
] as const;
