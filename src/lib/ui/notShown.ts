// The "N runs not shown: reasons" line (J-18): nothing is dropped silently. Pure; `NotShown.svelte` renders it.

/** Run states and counts that don't appear in scores, with the reason as a phrase after a count. */
const REASONS: Record<string, [one: string, many: string]> = {
  older: ['from an older version of its task', 'from an older version of their task'],
  harness: ['through a harness this suite does not score', 'through a harness this suite does not score'],
  invalid: ['marked invalid', 'marked invalid'],
  retired: ['of a retired task', 'of retired tasks'],
  unknown_task: ['of a task this suite does not list', 'of tasks this suite does not list'],
  withdrawn: ['withdrawn', 'withdrawn'],
  unscored: ['without a score', 'without a score'],
  provisional: ['of a provisional task', 'of provisional tasks'],
};

/** Known reasons first, in this order; anything else is appended under its raw name (never hidden). */
const ORDER = [
  'older',
  'harness',
  'invalid',
  'retired',
  'unknown_task',
  'withdrawn',
  'unscored',
  'provisional',
];

export interface NotShown {
  total: number;
  reasons: { key: string; n: number; text: string }[];
}

export function describeNotShown(counts: Record<string, number | undefined> | null | undefined): NotShown {
  const entries = Object.entries(counts ?? {}).filter(([, n]) => typeof n === 'number' && n > 0) as [
    string,
    number,
  ][];
  const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);
  entries.sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  const reasons = entries.map(([key, n]) => {
    const r = REASONS[key];
    const phrase = r ? (n === 1 ? r[0] : r[1]) : key.replace(/_/g, ' ');
    return { key, n, text: `${n.toLocaleString('en')} ${phrase}` };
  });
  return { total: reasons.reduce((s, r) => s + r.n, 0), reasons };
}

/** `12 runs not shown: 5 from an older version of their task, 4 marked invalid and 3 withdrawn`, or '' when none. */
export function notShownLine(counts: Record<string, number | undefined> | null | undefined): string {
  const d = describeNotShown(counts);
  if (!d.total) return '';
  const list = d.reasons.map((r) => r.text);
  const phrase = list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list.at(-1);
  return `${d.total.toLocaleString('en')} run${d.total === 1 ? '' : 's'} not shown: ${phrase}`;
}
