// The matrix and heatmap numbers (MAIN-MATRIX-*, MAIN-HEAT-*): what a cell shows, and an area's mean.
// A cell is "empty" (no runs in this suite), "uncounted" (runs, but none count) or "scored".

import { fmtRepeat, fmtScore, NONE } from '$lib/core/format';
import { cellsOf, type View } from '$lib/core/scoring';
import type { Block, Cell, CatalogTask, SuiteIndex } from '$lib/core/types';

export interface CellView {
  state: 'empty' | 'uncounted' | 'scored';
  mean: number | null;
  /** Repeats behind the mean. */
  n: number;
  /** Integer text (wide) and one-decimal text (cards); a dash when nothing counts. */
  wide: string;
  card: string;
  title: string;
  label: string;
  timeout: boolean;
}

/** The block a cell shows for a task: its provisional runs for a provisional task folded in, else the counted runs. */
export function blockFor(cell: Cell | undefined, provisional: boolean): Block | undefined {
  return provisional ? cell?.provisional : cell?.counted;
}

export function cellView(cell: Cell | undefined, provisional: boolean, who: string, task: string): CellView {
  const b = blockFor(cell, provisional);
  if (!cell || (!cell.runs && !b)) {
    return {
      state: 'empty',
      mean: null,
      n: 0,
      wide: '·',
      card: 'not run',
      title: '',
      label: '',
      timeout: false,
    };
  }
  const mean = b && typeof b.mean === 'number' ? b.mean : null;
  if (mean === null) {
    return {
      state: 'uncounted',
      mean: null,
      n: 0,
      wide: NONE,
      card: NONE,
      title: "These runs don't count in this suite",
      label: `${who} ${task}: doesn't count in this suite`,
      timeout: false,
    };
  }
  const rep = fmtRepeat({ n: b!.n_scored, min: b!.min ?? mean, max: b!.max ?? mean });
  return {
    state: 'scored',
    mean,
    n: b!.n_scored,
    wide: String(Math.round(mean)),
    card: fmtScore(mean),
    title: `${fmtScore(mean)} · ${rep}`,
    label: `${who} ${task}: ${fmtScore(mean)}, ${rep}`,
    timeout: (b!.timeouts ?? 0) > 0,
  };
}

export interface Area {
  id: string;
  label: string;
  tasks: CatalogTask[];
}

/** The section's areas (catalog order) that have at least one shown task. */
export function heatAreas(index: SuiteIndex, view: View): Area[] {
  const part = view.parts[0];
  if (!part || view.kind !== 'section') return [];
  const order = part.mode.areas.length
    ? part.mode.areas
    : index.catalog.areas.filter((a) => a.mode === part.mode.id).map((a) => a.id);
  const out: Area[] = [];
  for (const id of order) {
    const tasks = view.tasks.filter((t) => t.area === id);
    if (!tasks.length) continue;
    out.push({ id, label: index.catalog.areas.find((a) => a.id === id)?.label || id, tasks });
  }
  return out;
}

export interface AreaResult {
  /** Mean of the area's per-task means (null when none scored). */
  score: number | null;
  /** Tasks with a mean, and tasks in the area. */
  n: number;
  total: number;
}

export function areaResult(index: SuiteIndex, view: View, setup: string, area: Area): AreaResult {
  const cells = cellsOf(index, setup);
  const prov = new Set<string>(view.provisionalTasks.map((t) => t.id));
  const means: number[] = [];
  for (const t of area.tasks) {
    const b = blockFor(cells.get(t.id), prov.has(t.id));
    if (b && typeof b.mean === 'number') means.push(b.mean);
  }
  return {
    score: means.length ? means.reduce((s, v) => s + v, 0) / means.length : null,
    n: means.length,
    total: area.tasks.length,
  };
}

/** Task columns grouped by tier, in the view's order. */
export function tierGroups(view: View): { id: string; label: string; tasks: CatalogTask[] }[] {
  const out: { id: string; label: string; tasks: CatalogTask[] }[] = [];
  for (const t of view.tasks) {
    const id = String(t.tier ?? '');
    let g = out[out.length - 1];
    if (!g || g.id !== id) {
      g = { id, label: view.info.tier(id).label, tasks: [] };
      out.push(g);
    }
    g.tasks.push(t);
  }
  return out;
}
