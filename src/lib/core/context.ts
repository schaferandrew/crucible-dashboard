// The one data context every page reads (data-model §1.2) and its URL codec (B-01).
//
// A page is a `DataContext` with some dimensions pinned. View state lives in query parameters with the
// same names and value grammar as today's hash parameters:
//   ?mode=chat&suite=v3&exclude=forge&harness=pi&where=local&hw=m5-pro-48gb&quant=q4_k_m&provisional=1
// Values are comma lists of URI-encoded values; `all` entries are dropped; `-` is "not recorded" (the
// data's literal `unrecorded`). A parameter at its default is not written.

import { defaultSection, suiteInfo } from './catalog';
import type { Catalog, SectionId, SetupId, SuiteId, TierId } from './types';
import { COMBINED, asSectionId, asSetupId, asSuiteId, asTierId } from './types';

/** A facet of a setup a reader can filter on. Every dimension is a plain field of a setup. */
export type Dim =
  | 'model'
  | 'maker'
  | 'quant'
  | 'format'
  | 'packager'
  | 'reasoning'
  | 'harness'
  | 'where'
  | 'hw'
  | 'provider'
  | 'deployment';

/** The order filters are written to the URL in (the first group is today's order). */
export const DIMS: readonly Dim[] = [
  'harness',
  'where',
  'hw',
  'format',
  'quant',
  'packager',
  'reasoning',
  'model',
  'maker',
  'provider',
  'deployment',
];

export type Filters = Partial<Record<Dim, ReadonlySet<string>>>;

export interface DataContext {
  suite: SuiteId;
  /** A catalog mode, or `combined` (the default wherever the suite has at least two sections, B-18). */
  section: SectionId;
  filters: Filters;
  /** The one setup a detail block is about, if the reader picked one. */
  focus?: SetupId;
  provisional: boolean;
  exclude: ReadonlySet<TierId>;
}

export interface ContextEnv {
  currentSuite: SuiteId;
  /** Visible suites. An unknown suite id falls back to the current one (B-10). */
  suites: readonly SuiteId[];
}

/** The URL's literal for a value the data records as `unrecorded`. */
export const UNRECORDED_PARAM = '-';
export const UNRECORDED = 'unrecorded';

export function defaultContext(env: ContextEnv): DataContext {
  return { suite: env.currentSuite, section: COMBINED, filters: {}, provisional: false, exclude: new Set() };
}

const PARAM_ORDER_BEFORE = ['mode', 'suite', 'exclude'] as const;

/** Parse a raw query string (with or without `?`) into key -> raw decoded-per-value list. */
function rawParams(search: string): Map<string, string> {
  const out = new Map<string, string>();
  const s = search.startsWith('?') ? search.slice(1) : search;
  for (const part of s.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = safeDecode(eq < 0 ? part : part.slice(0, eq));
    if (!out.has(k)) out.set(k, eq < 0 ? '' : part.slice(eq + 1));
  }
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/** Split a comma list, decode each value, drop `all` and empties, map `-` to `unrecorded`. */
function listOf(raw: string | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const piece of raw.split(',')) {
    const v = safeDecode(piece);
    if (!v || v === 'all') continue;
    out.push(v === UNRECORDED_PARAM ? UNRECORDED : v);
  }
  return out;
}

export interface ParsedContext {
  ctx: DataContext;
  /** A `suite` that is unknown or hidden: the page falls back to the current suite with a notice. */
  unknownSuite: string | null;
}

/**
 * Read a context from a query string. Never throws: anything unreadable is ignored. The section is not
 * validated here (that needs the catalog): see `resolveContext`.
 * `provisionalFallback` is the remembered choice used when the URL doesn't say (B-13).
 */
export function parseContext(search: string, env: ContextEnv, provisionalFallback = false): ParsedContext {
  const p = rawParams(search);
  const ctx = defaultContext(env);
  let unknownSuite: string | null = null;

  const suite = p.get('suite') !== undefined ? safeDecode(p.get('suite')!) : '';
  if (suite) {
    if (env.suites.includes(asSuiteId(suite))) ctx.suite = asSuiteId(suite);
    else unknownSuite = suite;
  }
  const mode = p.get('mode') !== undefined ? safeDecode(p.get('mode')!) : '';
  if (mode) ctx.section = asSectionId(mode);

  const exclude = listOf(p.get('exclude'));
  ctx.exclude = new Set(exclude.map(asTierId));

  const filters: Record<string, ReadonlySet<string>> = {};
  for (const dim of DIMS) {
    const values = listOf(p.get(dim));
    if (values.length) filters[dim] = new Set(values);
  }
  ctx.filters = filters;

  const setup = p.get('setup');
  if (setup) ctx.focus = asSetupId(safeDecode(setup));

  const prov = p.get('provisional');
  ctx.provisional = prov === undefined ? provisionalFallback : prov === '1' || prov === 'true';
  return { ctx, unknownSuite };
}

/**
 * Check a context against the suite's catalog: an unknown section (or `combined` when the suite has fewer
 * than two sections) becomes the default section. Returns the same object when nothing changes.
 */
export function resolveContext(ctx: DataContext, catalog: Catalog): DataContext {
  const info = suiteInfo(catalog);
  const known =
    info.modes.some((m) => m.id === ctx.section) || (ctx.section === COMBINED && info.hasCombined);
  if (known) return ctx;
  return { ...ctx, section: defaultSection(info) };
}

/**
 * The query string (no leading `?`) for a context. Parameters at their default are left out: `suite` when it
 * is the current suite, `mode` when it is the default section, `exclude` when no tier of the section is left
 * out, filters when empty, `provisional` when off. Order: mode, suite, exclude, filters, setup, provisional.
 */
export function contextToSearch(ctx: DataContext, env: ContextEnv, catalog?: Catalog): string {
  const parts: string[] = [];
  const enc = (v: string) => encodeURIComponent(v);
  const info = catalog ? suiteInfo(catalog) : null;
  const defaultSec = info ? defaultSection(info) : COMBINED;

  const add = (k: string, values: string[]) => {
    if (values.length) parts.push(`${k}=${values.map(enc).join(',')}`);
  };
  for (const k of PARAM_ORDER_BEFORE) {
    if (k === 'mode' && ctx.section !== defaultSec) add('mode', [ctx.section]);
    if (k === 'suite' && ctx.suite !== env.currentSuite) add('suite', [ctx.suite]);
    if (k === 'exclude') {
      // Written only for tiers present in the section, and only when not every tier is included
      const present = new Set(info ? tiersOfSection(info, ctx.section) : [...ctx.exclude]);
      const ex = [...ctx.exclude].filter((t) => present.has(t));
      if (ex.length && !(info && ex.length >= present.size)) add('exclude', ex);
    }
  }
  for (const dim of DIMS) {
    const set = ctx.filters[dim];
    if (set && set.size)
      add(
        dim,
        [...set].sort().map((v) => (v === UNRECORDED ? UNRECORDED_PARAM : v)),
      );
  }
  if (ctx.focus) add('setup', [ctx.focus]);
  if (ctx.provisional) parts.push('provisional=1');
  return parts.join('&');
}

function tiersOfSection(info: ReturnType<typeof suiteInfo>, section: string): string[] {
  const wanted = (t: { mode: string | null }) => section === COMBINED || t.mode === section;
  const used = new Set(info.tasks.filter(wanted).map((t) => t.tier));
  return info.tiers.map((t) => t.id).filter((id) => used.has(id));
}

/** Two contexts that read the same (same section, suite, exclusion, filters, focus, provisional). */
export function sameContext(a: DataContext, b: DataContext): boolean {
  if (
    a.suite !== b.suite ||
    a.section !== b.section ||
    a.provisional !== b.provisional ||
    a.focus !== b.focus
  )
    return false;
  const eq = (x: ReadonlySet<string> | undefined, y: ReadonlySet<string> | undefined) => {
    const xs = x ?? new Set<string>(),
      ys = y ?? new Set<string>();
    return xs.size === ys.size && [...xs].every((v) => ys.has(v));
  };
  if (!eq(a.exclude, b.exclude)) return false;
  return DIMS.every((d) => eq(a.filters[d], b.filters[d]));
}

/** Number of active filter values groups (for "Filters (n on)"). Exclusion counts, the provisional preview does not. */
export function activeFilterCount(ctx: DataContext): number {
  return DIMS.filter((d) => ctx.filters[d]?.size).length + (ctx.exclude.size ? 1 : 0);
}
