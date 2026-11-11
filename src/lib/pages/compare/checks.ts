// The checks of one run, from its `runs/<uuid>.json`, for the compare page's side-by-side panel (CMP-DIFF-04).
// Pure and tolerant: anything missing becomes a message, never an exception.

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export interface CheckItem {
  label: string;
  passed: boolean | null;
  detail: string | null;
}

export interface RunChecks {
  /** Per-check results, in groups (a nameless group first). */
  groups: { name: string | null; items: CheckItem[] }[];
  /** When there are no items but group totals, one line per group. */
  lines: string[];
  /** Why there is nothing to list, else null. */
  empty: string | null;
}

/** The score record the suite used for the run (`score_ref`), else any at that rubric, else the first. */
function chooseScore(run: Rec, suite: string): Rec | null {
  const scores = arr(run.scores).map(rec);
  const ref = rec(rec(rec(run.suites)[suite]).score_ref);
  return (
    scores.find((s) => s.rubric_version === ref.rubric_version && s.method === ref.method) ??
    scores.find((s) => s.rubric_version === ref.rubric_version) ??
    scores[0] ??
    null
  );
}

export function checksFromRun(run: unknown, suite: string): RunChecks {
  const record = chooseScore(rec(run), suite);
  if (!record) return { groups: [], lines: [], empty: 'No score record for this run.' };
  const items = arr(record.items).map(rec);
  if (items.length) {
    const groups = new Map<string, CheckItem[]>();
    for (const it of items) {
      const g = str(it.group) ?? '';
      const list = groups.get(g) ?? [];
      list.push({
        label: str(it.label) ?? str(it.id) ?? 'check',
        passed: typeof it.passed === 'boolean' ? it.passed : null,
        detail: str(it.detail),
      });
      groups.set(g, list);
    }
    return {
      groups: [...groups].map(([name, list]) => ({ name: name || null, items: list })),
      lines: [],
      empty: null,
    };
  }
  const lines = arr(record.groups)
    .map(rec)
    .map((g) => {
      const passed = num(g.passed);
      const total = num(g.total);
      return `${passed !== null && total !== null ? `${passed}/${total} ` : ''}${str(g.id) ?? 'group'}${str(g.detail) ? ` (${str(g.detail)})` : ''}`;
    });
  return lines.length
    ? { groups: [], lines, empty: null }
    : { groups: [], lines: [], empty: 'No per-check results published for this score.' };
}
