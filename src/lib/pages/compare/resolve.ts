// Turning the URL (`?s=<setup>,<setup>[&mode=<section>][&suite=<id>]`) into the sides of a comparison
// (CMP-URL-01, CMP-RESOLVE-01..03, B-01, B-04, B-18), and the display text of a side. Pure.
//
// A side is a leaderboard *candidate* of the chosen section: one setup, or in Combined one setup per section
// that agree on everything but the harness (its id is the members' ids joined by `+`, made by site-data).
// Nothing here parses an id: ids are looked up, never split.

import { defaultSection, suiteInfo } from '$lib/core/catalog';
import { cap } from '$lib/core/format';
import { rowLabel, viewFor, type Candidate, type View } from '$lib/core/scoring';
import type { Setup, SuiteIndex } from '$lib/core/types';
import { COMBINED } from '$lib/core/types';
import { MAX_COMPARE, type Identity } from './pairing';

export interface Resolved {
  /** A catalog mode or `combined`. */
  section: string;
  /** The URL said so (CMP-URL-03): only then is `mode` written back. */
  explicitMode: boolean;
  view: View;
  /** Chosen sides, in URL order, at most MAX_COMPARE. */
  items: Candidate[];
  /** Resolution notes, shown above the controls. */
  notes: string[];
}

export function sectionName(index: SuiteIndex, section: string): string {
  const info = suiteInfo(index.catalog);
  if (section === COMBINED) return info.combinedLabel;
  const m = info.mode(section);
  return m?.label || cap(section);
}

function listNames(names: string[]): string {
  return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : (names[0] ?? '');
}

/** "Model (reasoning x) (setup description)" for notes. */
export function describe(
  index: SuiteIndex,
  c: { model: string; reasoning: string; members: (Setup | null)[]; first: Setup },
): string {
  return `${rowLabel(index, c.model, c.reasoning)} (${setupText(c.members, c.first)})`;
}

/** Packager, quant, hardware or provider, harness: what tells setups of one model apart. */
export function setupText(members: readonly (Setup | null)[], first: Setup): string {
  const harness = [...new Set(members.filter((m): m is Setup => !!m).map((m) => m.harness))].join(' + ');
  if (first.where !== 'local')
    return [`via ${first.labels.provider ?? first.provider ?? 'cloud'}`, harness].join(' · ');
  const packager =
    first.labels.packager && first.labels.packager !== 'unrecorded' ? first.labels.packager : '';
  const quant = first.quant && first.quant !== 'unrecorded' ? first.quant : 'quant not recorded';
  const weights = [packager, quant].join(' ');
  const machines = first.labels.machines.length ? ` (${first.labels.machines.join(', ')})` : '';
  const hw = first.labels.hw
    ? first.labels.hw + machines
    : first.hw === 'unrecorded' || !first.hw
      ? 'hardware not recorded'
      : first.hw;
  return [weights, hw, harness].join(' · ');
}

/** Does the side's own setup lack a recorded machine or provider? Its speed and cost are never compared. */
export function unrecordedDeployment(first: Setup): boolean {
  return first.unrecorded.some((u) => u === 'where' || u === 'provider' || u === 'hw');
}

export function identityOf(c: Candidate): Identity {
  const f = c.first;
  return {
    model: c.first.model,
    weights: c.first.where === 'local' ? [f.packager, f.format, f.quant].join('|') : 'api',
    reasoning: c.first.reasoning,
    harness: c.members
      .filter((m): m is Setup => !!m)
      .map((m) => m.harness)
      .join('+'),
  };
}

/** Variant text: `<quant> · reasoning <level>[ · <harness>]`; cloud leaves the weights out (IDENT-VAR-03). */
export function variantText(c: Candidate, withHarness: boolean): string {
  const f = c.first;
  const parts: string[] = [];
  if (f.where === 'local') parts.push(f.quant && f.quant !== 'unrecorded' ? f.quant : 'quant not recorded');
  parts.push(`reasoning ${f.reasoning}`);
  if (withHarness)
    parts.push(
      c.members
        .filter((m): m is Setup => !!m)
        .map((m) => m.harness)
        .join(' + '),
    );
  return parts.join(' · ');
}

/** "Packaged by x", only when a packager is recorded and is not the maker (IDENT-MAKER-06). */
export function packagedBy(c: Candidate): string | null {
  const f = c.first;
  const p = f.labels.packager ?? f.packager;
  return p && p !== 'unrecorded' && p !== f.maker && p !== f.labels.maker ? `Packaged by ${p}` : null;
}

export function deploymentText(index: SuiteIndex, c: Candidate): string {
  const d = index.entities.deployments[c.first.deployment];
  if (d?.label) return d.label;
  const f = c.first;
  return f.where === 'local'
    ? 'machine not recorded'
    : `via ${f.labels.provider ?? 'a provider not recorded'}`;
}

/** The harness belongs in a variant label when the section (or, in Combined, any section) has several. */
export function harnessCount(index: SuiteIndex, view: View): number {
  const info = suiteInfo(index.catalog);
  return view.kind === 'combined'
    ? Math.max(0, ...info.modes.map((m) => m.harnesses.length))
    : (info.mode(view.id)?.harnesses.length ?? 0);
}

/** A name for charts and column heads: the model, plus what tells it from another chosen side of the same model. */
export function shortLabels(index: SuiteIndex, items: readonly Candidate[], withHarness: boolean): string[] {
  return items.map((c) => {
    const name = rowLabel(index, c.model, c.reasoning);
    const same = items.filter((o) => rowLabel(index, o.model, o.reasoning) === name);
    if (same.length < 2) return name;
    const v = variantText(c, withHarness);
    const sameVariant = same.filter(
      (o) => variantText(o, withHarness) === v && o.first.artifact === c.first.artifact,
    );
    return `${name} (${v}${sameVariant.length > 1 ? ', ' + deploymentText(index, c) : ''})`;
  });
}

/** The picker's option text: "<row label> · local|cloud · <setup description>". */
export function fullLabel(index: SuiteIndex, c: Candidate): string {
  return `${rowLabel(index, c.model, c.reasoning)} · ${c.first.where} · ${setupText(c.members, c.first)}`;
}

/** Picker options grouped by maker (alphabetical, unknown last), as in CMP-CTRL-04. */
export function pickerGroups(
  index: SuiteIndex,
  candidates: readonly Candidate[],
  chosen: readonly Candidate[],
): { maker: string; label: string; options: { id: string; text: string }[] }[] {
  const taken = new Set(chosen.map((c) => c.id));
  const groups = new Map<string, { maker: string; label: string; options: { id: string; text: string }[] }>();
  for (const c of candidates) {
    if (taken.has(c.id)) continue;
    const maker = c.first.maker && c.first.maker !== 'unknown' ? c.first.maker : '';
    let g = groups.get(maker);
    if (!g) {
      groups.set(
        maker,
        (g = { maker, label: maker ? c.first.labels.maker || maker : 'Unknown maker', options: [] }),
      );
    }
    g.options.push({ id: c.id, text: fullLabel(index, c) });
  }
  return [...groups.values()].sort((a, b) =>
    !a.maker ? 1 : !b.maker ? -1 : a.label.toLowerCase() < b.label.toLowerCase() ? -1 : 1,
  );
}

// ---- Series colours (CMP-RESOLVE-03) ----

/** Keep the colour a side already has; give a new side the first free one. Pure: returns a new record. */
export function assignColors(
  previous: Readonly<Record<string, string>>,
  ids: readonly string[],
  palette: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const taken = new Set<string>();
  for (const id of ids) {
    const c = previous[id];
    if (c && !taken.has(c) && palette.includes(c)) {
      out[id] = c;
      taken.add(c);
    }
  }
  for (const id of ids) {
    if (out[id]) continue;
    const c = palette.find((p) => !taken.has(p)) ?? palette[0]!;
    out[id] = c;
    taken.add(c);
  }
  return out;
}

// ---- Resolution ----

/** The sections a setup can be compared in: those where it is a candidate (read from the views, not guessed). */
export function sectionsOf(index: SuiteIndex, setup: Setup): string[] {
  return suiteInfo(index.catalog)
    .modes.filter((m) =>
      viewFor(index, m.id)
        .candidates()
        .some((c) => c.members.some((x) => x?.id === setup.id)),
    )
    .map((m) => m.id as string);
}

interface Token {
  raw: string;
  setup: Setup | null;
  entity: Candidate | null;
}

/**
 * `tokens` are the `s` values (setup ids, or a Combined side's id); `legacy` maps an old setup slug to a
 * setup id (the shared legacy translator's `legacy-slugs.json`). Never throws.
 */
export function resolveCompare(
  index: SuiteIndex,
  tokens: readonly string[],
  mode: string | null,
  legacy: Readonly<Record<string, string>> = {},
): Resolved {
  const info = suiteInfo(index.catalog);
  const notes: string[] = [];
  const suiteName = index.catalog.suite.name || index.suite;

  let section: string | null = null;
  if (mode) {
    const known = info.modes.some((m) => m.id === mode) || (mode === COMBINED && info.hasCombined);
    if (known) section = mode;
    else notes.push(`There is no section "${mode}" in ${suiteName}.`);
  }
  const explicitMode = section !== null;

  const combinedCands = info.hasCombined ? viewFor(index, COMBINED).candidates() : [];
  const toks: Token[] = [];
  for (const raw of tokens.map((t) => t.trim()).filter(Boolean)) {
    const setup = index.entities.setups[raw] ?? null;
    const entity = setup ? null : (combinedCands.find((c) => c.id === raw) ?? null);
    if (setup || entity) {
      toks.push({ raw, setup, entity });
      continue;
    }
    const mapped = legacy[raw] ? (index.entities.setups[legacy[raw]!] ?? null) : null;
    if (mapped) toks.push({ raw, setup: mapped, entity: null });
    else notes.push(`"${raw}" isn't a setup in the results, so it was left out.`);
  }

  if (!section) {
    const modes = new Set<string>();
    let entityTok = false;
    for (const t of toks) {
      if (t.entity) entityTok = true;
      if (t.setup) for (const m of sectionsOf(index, t.setup)) modes.add(m);
    }
    // B-18: Combined when the setups span sections; the section they share otherwise
    section =
      entityTok || modes.size > 1
        ? info.hasCombined
          ? COMBINED
          : defaultSection(info)
        : modes.size === 1
          ? [...modes][0]!
          : defaultSection(info);
  }
  const view = viewFor(index, section);
  const cands = view.candidates();
  const secName = sectionName(index, section);

  const items: Candidate[] = [];
  for (const t of toks) {
    let found: Candidate | undefined;
    if (t.entity) found = cands.find((c) => c.id === t.entity!.id);
    else if (t.setup) {
      const holding = cands.filter((c) => c.members.some((m) => m && m.id === t.setup!.id));
      found = holding[0];
      if (holding.length > 1 && !items.includes(found!))
        notes.push(
          `${rowLabel(index, t.setup.model, t.setup.reasoning)} pairs with more than one setup in ${secName}; the first pairing (${found!.members
            .filter((m): m is Setup => !!m)
            .map((m) => m.harness)
            .join(' + ')}) is shown.`,
        );
    }
    const subject = t.setup ?? t.entity!.first;
    const label = describe(
      index,
      t.setup
        ? { model: subject.model, reasoning: subject.reasoning, members: [subject], first: subject }
        : t.entity!,
    );
    if (!found) {
      const ranIn = sectionsOf(index, t.setup ?? t.entity!.first);
      const ran = ranIn.map((m) => sectionName(index, m));
      if (t.setup && ran.length && !ranIn.includes(section) && section !== COMBINED)
        notes.push(
          `${label} ran in ${listNames(ran)}, not ${secName}. Setups from different sections can't be compared, so it was left out.`,
        );
      else if (t.entity && section !== COMBINED)
        notes.push(
          `${label} pairs setups from several sections, so it can only be compared in ${info.combinedLabel}; it was left out.`,
        );
      else notes.push(`${label} has no scored task in ${secName}, so it was left out.`);
      continue;
    }
    if (items.some((c) => c.id === found!.id)) continue;
    if (items.length >= MAX_COMPARE) {
      notes.push(`Up to ${MAX_COMPARE} setups can be compared; ${label} was left out.`);
      continue;
    }
    items.push(found);
  }
  return { section, explicitMode, view, items, notes };
}
