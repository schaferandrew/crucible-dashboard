// The matrix and heatmap numbers (MAIN-MATRIX-*, MAIN-HEAT-*): what a cell shows, and an area's mean.
// A cell is "empty" (no runs in this suite), "uncounted" (runs, but none count) or "scored".

import { fmtRepeat, fmtScore, NONE } from '$lib/core/format';
import { cellsOf, type Row, type View } from '$lib/core/scoring';
import type { Block, Cell, CatalogTask, Setup, SuiteIndex, TaskId } from '$lib/core/types';

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
  /** The view part (section) the area belongs to: always 0 in a section view. */
  part: number;
}

/**
 * The setup a row shows for a task. A section row has one setup; a Combined row pairs one setup per section
 * (B-23), so a chat task reads the row's chat setup and an agentic task its agentic setup. Null when the row
 * has no setup in that task's section.
 */
export function setupFor(view: View, row: Row, task: TaskId): Setup | null {
  if (view.kind !== 'combined') return row.setup;
  for (let i = 0; i < view.parts.length; i++) {
    if (view.parts[i]!.taskIds.has(task) && row.candidate.members[i]) return row.candidate.members[i]!;
  }
  return null;
}

/** The setup a row shows for one part (section) of the view. */
export function partSetup(view: View, row: Row, part: number): Setup | null {
  return view.kind === 'combined' ? (row.candidate.members[part] ?? null) : row.setup;
}

/** The areas (catalog order) that have at least one shown task: one section's, or every section's in Combined. */
export function heatAreas(index: SuiteIndex, view: View): Area[] {
  const out: Area[] = [];
  const combined = view.kind === 'combined';
  view.parts.forEach((part, p) => {
    const order = part.mode.areas.length
      ? part.mode.areas
      : index.catalog.areas.filter((a) => a.mode === part.mode.id).map((a) => a.id);
    for (const id of order) {
      const tasks = part.tasks.filter((t) => t.area === id);
      if (!tasks.length) continue;
      const label = index.catalog.areas.find((a) => a.id === id)?.label || id;
      out.push({
        id: combined ? `${part.id}:${id}` : id,
        label: combined ? `${part.label} · ${label}` : label,
        tasks,
        part: p,
      });
    }
  });
  return out;
}

export interface AreaResult {
  /** Mean of the area's per-task means (null when none scored). */
  score: number | null;
  /** Tasks with a mean, and tasks in the area. */
  n: number;
  total: number;
}

export function areaResult(index: SuiteIndex, view: View, setup: string | null, area: Area): AreaResult {
  if (!setup) return { score: null, n: 0, total: area.tasks.length };
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

export interface TierGroup {
  id: string;
  label: string;
  tasks: CatalogTask[];
  /** The first group of a section (Combined only), drawn with a stronger edge. */
  sectionStart: boolean;
}

/** Task columns grouped by tier, in the view's order; in Combined, section by section, then tier by tier. */
export function tierGroups(view: View): TierGroup[] {
  const out: TierGroup[] = [];
  const combined = view.kind === 'combined';
  for (const part of combined ? view.parts : [view]) {
    let first = true;
    for (const t of part.tasks) {
      const tier = String(t.tier ?? '');
      let g = out[out.length - 1];
      if (!g || g.id !== (combined ? `${part.id}:${tier}` : tier) || first) {
        const tl = view.info.tier(tier).label;
        g = {
          id: combined ? `${part.id}:${tier}` : tier,
          label: combined ? `${part.label} · ${tl}` : tl,
          tasks: [],
          sectionStart: combined && first,
        };
        out.push(g);
        first = false;
      }
      g.tasks.push(t);
    }
  }
  return out;
}
