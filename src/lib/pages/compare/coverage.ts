// Compare pools keep run identity, but count each task only once for coverage.
import { cellsOf, type Candidate } from '$lib/core/scoring';
import type { SuiteIndex } from '$lib/core/types';
import type { CountedBlock } from './numbers';

export function mixedDeployments(c: Candidate): boolean {
  return new Set(c.members.filter((m) => m !== null).map((m) => m.deployment)).size > 1;
}

export function countedBlocks(index: SuiteIndex, c: Candidate): Map<string, CountedBlock> {
  const out = new Map<string, CountedBlock>();
  const seen = new Set<string>();
  for (const member of c.members) {
    if (!member || seen.has(member.id)) continue;
    seen.add(member.id);
    for (const [task, cell] of cellsOf(index, member.id)) {
      const b = cell.counted;
      if (!b || !b.n) continue;
      const old = out.get(task);
      if (!old) {
        out.set(task, { ...b });
        continue;
      }
      const finished = old.n_finished + b.n_finished;
      // Finished scores are weighted by repeat count, never by the best observed run.
      const scored =
        (old.mean_finished === null ? 0 : old.n_finished) + (b.mean_finished === null ? 0 : b.n_finished);
      out.set(task, {
        n: old.n + b.n,
        n_finished: finished,
        mean_finished: scored
          ? ((old.mean_finished ?? 0) * old.n_finished + (b.mean_finished ?? 0) * b.n_finished) / scored
          : null,
        timeouts: old.timeouts + b.timeouts,
        errors: old.errors + b.errors,
      });
    }
  }
  return out;
}

export function finishedTasks(
  index: SuiteIndex,
  c: Candidate,
  tasks: readonly { id: string }[],
): Set<string> {
  const blocks = countedBlocks(index, c);
  return new Set(
    tasks
      .filter((t) => {
        const b = blocks.get(t.id);
        return b && b.n_finished > 0 && b.mean_finished !== null;
      })
      .map((t) => t.id),
  );
}

export function coverage(index: SuiteIndex, c: Candidate, tasks: readonly { id: string }[]) {
  const blocks = countedBlocks(index, c);
  return {
    done: finishedTasks(index, c, tasks).size,
    total: tasks.length,
    attempted: tasks.filter((t) => (blocks.get(t.id)?.n ?? 0) > 0).length,
    runs: tasks.reduce((n, t) => n + (blocks.get(t.id)?.n ?? 0), 0),
  };
}

export function overlap(
  index: SuiteIndex,
  items: readonly Candidate[],
  tasks: readonly { id: string }[],
): number {
  const sets = items.map((c) => finishedTasks(index, c, tasks));
  return items.length ? tasks.filter((t) => sets.every((s) => s.has(t.id))).length : 0;
}

/** Pool only identical variants and section/harness combinations, retaining all source setups. */
export function poolCandidates(candidates: readonly Candidate[]): Candidate[] {
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const f = c.first;
    const unknown = f.unrecorded.some((field) =>
      ['model', 'packager', 'format', 'quant', 'reasoning', 'harness'].includes(field),
    );
    const key = JSON.stringify([
      unknown ? c.id : null,
      f.model,
      f.artifact,
      f.packager,
      f.format,
      f.quant,
      f.reasoning,
      f.where,
      c.members.map((m) => m?.harness ?? null),
    ]);
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  return [...groups.values()].map((list) => {
    if (list.length === 1) return list[0]!;
    const members = [
      ...new Map(list.flatMap((c) => c.members.filter((m) => m !== null)).map((m) => [m.id, m])).values(),
    ];
    return {
      ...list[0]!,
      members,
      id:
        'pool:' +
        members
          .map((m) => m.id)
          .sort()
          .join('|'),
    };
  });
}
