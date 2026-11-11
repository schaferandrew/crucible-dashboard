// The todo page's entries for one section of one suite: the candidate setups (TODO-DATA-01), the tasks each
// still lacks, and the sections the page offers (TODO-CTRL-02, TODO-URL-04). Pure over a loaded `SuiteIndex`.

import { suiteInfo } from '$lib/core/catalog';
import {
  cellsOf,
  buildRows,
  rowLabel,
  sectionView,
  type RowStats,
  type SectionView,
} from '$lib/core/scoring';
import type { SuiteIndex } from '$lib/core/types';
import { computeLeft, type Entry, type TaskLite, type TaskTimes } from './shape';

export interface SectionChoice {
  id: string;
  label: string;
}

/** Sections that have at least one scored task. Combined is never offered (OQ-08). All sections when none has. */
export function sectionChoices(index: SuiteIndex): SectionChoice[] {
  const modes = suiteInfo(index.catalog).modes;
  const withTasks = modes.filter((m) => sectionView(index, m.id).tasks.length > 0);
  return (withTasks.length ? withTasks : modes).map((m) => ({ id: m.id, label: m.label || cap(m.id) }));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The section to show: the requested one if the suite offers it, else the first (TODO-URL-04). */
export function pickSection(
  choices: readonly SectionChoice[],
  requested: string | null,
): SectionChoice | null {
  return choices.find((c) => c.id === requested) ?? choices[0] ?? null;
}

/** The section's scored tasks in display order, with their tier labels. */
export function sectionTasks(view: SectionView): TaskLite[] {
  return view.tasks
    .filter((t) => t.status === 'active')
    .map((t) => ({
      id: t.id,
      name: t.name || t.id,
      tier: t.tier ? view.info.tier(t.tier).label : null,
    }));
}

export interface TodoBuild {
  view: SectionView;
  tasks: TaskLite[];
  /** Candidates considered. */
  considered: number;
  /** Candidates with a counted mean for every scored task (summarised, not listed). */
  complete: number;
  entries: Entry<RowStats>[];
}

/**
 * Candidates: with `all`, every setup of the section with at least one counted run; otherwise each
 * leaderboard row's best setup, with no filters (TODO-DATA-01). An entry exists only for a candidate with
 * at least one scored task left (TODO-DATA-02).
 */
export function buildTodo(index: SuiteIndex, section: string, all: boolean, times: TaskTimes): TodoBuild {
  const view = sectionView(index, section);
  const tasks = sectionTasks(view);
  const stats: RowStats[] = all
    ? view
        .candidates()
        .map((c) => view.stats(c))
        .filter((s) => s.runs > 0)
    : buildRows(index, view);
  const entries: Entry<RowStats>[] = [];
  for (const s of stats) {
    const left = computeLeft(s.setup.id, tasks, cellsOf(index, s.setup.id), times);
    if (!left) continue;
    entries.push({
      key: s.candidate.id,
      label: rowLabel(index, s.candidate.model, s.candidate.reasoning),
      score: s.overall.score,
      left,
      stat: s,
    });
  }
  return { view, tasks, considered: stats.length, complete: stats.length - entries.length, entries };
}
