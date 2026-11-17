// Shapes the current suite's catalog into what the About page prints. Pure: no fetching, no component code.
// Every label, blurb, tier and area comes from the catalog; the only text added here is punctuation and the
// documented fallbacks (a missing blurb is an em dash, a missing changelog is the repo's).

import { suiteInfo } from '$lib/core/catalog';
import { NONE } from '$lib/core/format';
import type { Catalog, CatalogArea } from '$lib/core/types';
import { DEFAULT_CHANGELOG_URL } from './config';

export interface AreaRow {
  id: string;
  label: string;
  blurb: string;
  examples: string;
}
export interface AreaGroup {
  id: string;
  label: string;
  /** "<label> · <blurb with a lowercase first letter>", or just the label when the section has no blurb. */
  heading: string;
  areas: AreaRow[];
}
export interface TierItem {
  id: string;
  label: string;
  text: string;
}
export interface RuleTask {
  id: string;
  name: string;
  rules: string[];
}
export interface AboutView {
  suiteId: string;
  crucibleVersion: string | null;
  changelogUrl: string;
  sectionLabels: string[];
  groups: AreaGroup[];
  tiers: TierItem[];
  overallLabel: string;
  /** Null when the suite has fewer than two sections: there is no Combined view to describe. */
  combinedLabel: string | null;
  ruleTasks: RuleTask[];
}

export const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

export function shapeAbout(
  catalog: Catalog,
  rulesByTask: Record<string, string[]>,
  crucibleVersion: string | null,
): AboutView {
  const info = suiteInfo(catalog);
  const byId = new Map(catalog.areas.map((a) => [a.id, a]));

  const groups = info.modes.map((m): AreaGroup => {
    const listed = m.areas.map((id) => byId.get(id)).filter((a): a is CatalogArea => !!a);
    // A mode that lists no areas gets the catalog's areas that name it
    const areas = (listed.length ? listed : catalog.areas.filter((a) => a.mode === m.id))
      .filter((a) => a.mode == null || a.mode === m.id)
      .map((a) => ({
        id: a.id,
        label: a.label || a.id,
        blurb: a.blurb || NONE,
        examples: a.examples || NONE,
      }));
    const heading = m.blurb ? `${m.label || m.id} · ${lowerFirst(m.blurb)}` : m.label || m.id;
    return { id: m.id, label: m.label || m.id, heading, areas };
  });

  return {
    suiteId: catalog.suite.id,
    crucibleVersion: crucibleVersion || null,
    changelogUrl: catalog.suite.changelog_url || DEFAULT_CHANGELOG_URL,
    sectionLabels: info.modes.map((m) => m.label || m.id),
    groups,
    tiers: info.tiers.map((t) => ({ id: t.id, label: t.label || t.id, text: t.detail || t.blurb })),
    overallLabel: info.overallLabel,
    combinedLabel: info.hasCombined ? info.combinedLabel : null,
    ruleTasks: info.tasks
      .filter((t) => t.status === 'active' && (rulesByTask[t.id]?.length ?? 0) > 0)
      .map((t) => ({ id: t.id, name: t.name || t.id, rules: rulesByTask[t.id]! })),
  };
}
