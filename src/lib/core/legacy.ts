// Legacy link translator (B-01, ROUTE-06..12): maps an old `/crucible/...#hash` URL to its new path + query.
// Pure. It backs the redirect stubs that replace the old pages at cutover.
//
// Old grammar (ROUTE-06): `#<id>&key=value&key=value` where the single part without `=` is the page's id
// (main: the mode; task: the task id; model: `<maker>[/<model>]`; compare: a comma list of setup slugs).
// Values are URI-encoded; list values are comma-separated. The new grammar keeps the parameter names and the
// value grammar and moves them from the hash to the query (`?mode=chat&suite=v3&harness=pi`); the page id
// moves into the path, except the main page's mode (`?mode=`) and compare's setups (`?s=`).
//
// Setup slugs are the old page's setup identity; the new site uses setup IDs (B-04). A slug maps through
// `maps.setups` (the generated `legacy-slugs.json`); one that doesn't map is reported in `unresolved` and
// left out. Nothing here guesses.

import { DIMS } from './context';
import {
  aboutPath,
  comparePath,
  leaderboardPath,
  modelPath,
  runsPath,
  taskPath,
  todoPath,
  withQuery,
  type Params,
} from './urls';

export interface LegacyMaps {
  /** Old setup slug -> setup ID. */
  setups?: Record<string, string>;
  /** Old deployment key (model page `&deployment=`) -> deployment ID. */
  deployments?: Record<string, string>;
  /** Old maker slug -> maker ID (B-14: `ibm` is `ibm-granite`). */
  makers?: Record<string, string>;
}

export interface LegacyInput {
  pathname: string;
  search?: string;
  hash?: string;
}

export interface Translated {
  /** New path, relative to the app base, ending in `/`. */
  path: string;
  /** New query string, no leading `?`. */
  search: string;
  /** `path` + `?search`. */
  href: string;
  /** Legacy setup slugs that could not be mapped (left out of the new URL). */
  unresolved: string[];
  /** Legacy params that have no new equivalent (`variant=…`), recorded as `key=value`. */
  dropped: string[];
}

const DEFAULT_MAKERS: Record<string, string> = { ibm: 'ibm-granite' };
/** The old route prefix on the site. */
export const LEGACY_PREFIX = '/crucible';

function dec(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/** `#<id>&k=v&…` -> the id (decoded, may be empty) and the params (first occurrence wins), values decoded. */
export function parseLegacyHash(hash: string): {
  id: string;
  params: Map<string, string>;
  raw: Map<string, string>;
} {
  const s = hash.startsWith('#') ? hash.slice(1) : hash;
  let id = '';
  let haveId = false;
  const params = new Map<string, string>();
  const raw = new Map<string, string>();
  for (const part of s.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) {
      if (!haveId) {
        id = dec(part);
        haveId = true;
      }
      continue;
    }
    const k = dec(part.slice(0, eq));
    if (!params.has(k)) {
      params.set(k, dec(part.slice(eq + 1)));
      raw.set(k, part.slice(eq + 1));
    }
  }
  return { id, params, raw };
}

/** A comma list with each piece decoded; `all` and empties dropped (the old "everything" values). */
function list(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(dec)
    .filter((v) => v && v !== 'all');
}

const isOn = (v: string | undefined) => v === '1' || v === 'true';

/** Which of the old seven pages a path is, or null when it isn't a Crucible path. */
function routeOf(pathname: string): 'main' | 'task' | 'model' | 'compare' | 'run' | 'todo' | 'about' | null {
  let p = pathname.replace(/\/index\.html$/, '/');
  if (p === LEGACY_PREFIX) p += '/';
  if (!p.startsWith(LEGACY_PREFIX + '/')) return null;
  const rest = p.slice(LEGACY_PREFIX.length + 1).replace(/\/+$/, '');
  if (rest === '') return 'main';
  switch (rest) {
    case 'task':
    case 'model':
    case 'compare':
    case 'run':
    case 'todo':
    case 'about':
      return rest;
    default:
      return null;
  }
}

function done(path: string, params: Params, unresolved: string[], dropped: string[]): Translated {
  const href = withQuery(path, params);
  const q = href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
  return { path, search: q, href, unresolved, dropped };
}

function slugsToSetups(slugs: string[], maps: LegacyMaps, unresolved: string[]): string[] {
  const out: string[] = [];
  for (const slug of slugs) {
    const id = maps.setups?.[slug];
    if (id) {
      if (!out.includes(id)) out.push(id);
    } else unresolved.push(slug);
  }
  return out;
}

/**
 * Translate an old Crucible URL. Accepts a full URL, a path with hash, or `{pathname, search, hash}`.
 * Returns null when the path is not one of the old Crucible pages.
 */
export function translateLegacyUrl(
  input: string | URL | LegacyInput,
  maps: LegacyMaps = {},
): Translated | null {
  let pathname: string, search: string, hash: string;
  if (typeof input === 'string' || input instanceof URL) {
    const u = input instanceof URL ? input : new URL(input, 'https://legacy.invalid');
    ({ pathname, search, hash } = u);
  } else {
    pathname = input.pathname;
    search = input.search ?? '';
    hash = input.hash ?? '';
  }
  const route = routeOf(pathname);
  if (!route) return null;

  const { id, params: h, raw } = parseLegacyHash(hash);
  const q = parseLegacyHash(search.startsWith('?') ? search.slice(1) : search).params;
  const unresolved: string[] = [];
  const dropped: string[] = [];
  const suite = h.get('suite') || undefined;
  const makerMap = { ...DEFAULT_MAKERS, ...maps.makers };

  switch (route) {
    case 'main': {
      // ROUTE-12 / MAIN-URL-13: any `compare` param sends the reader to the compare page (first 4 slugs)
      if (h.has('compare')) {
        const slugs = list(raw.get('compare')).slice(0, 4);
        const ids = slugsToSetups(slugs, maps, unresolved);
        return done(comparePath(), { s: ids, suite }, unresolved, dropped);
      }
      const params: Params = {};
      if (id) params.mode = id;
      params.suite = suite;
      const exclude = list(raw.get('exclude'));
      if (exclude.length) params.exclude = exclude;
      for (const dim of DIMS) {
        if (dim === 'task') continue;
        const values = list(raw.get(dim));
        // old single-select defaults: harness `best`, where `all`
        const kept = dim === 'harness' ? values.filter((v) => v !== 'best') : values;
        if (kept.length) params[dim] = kept;
      }
      // MAIN-URL-08: hash wins over the query (`?provisional=1`), and the new URL carries it explicitly
      const prov = h.has('provisional') ? isOn(h.get('provisional')) : isOn(q.get('provisional'));
      if (prov) params.provisional = '1';
      return done(leaderboardPath(), params, unresolved, dropped);
    }
    case 'task': {
      const params: Params = { suite, provisional: isOn(h.get('provisional')) ? '1' : undefined };
      return done(id ? taskPath(id) : '/task/', params, unresolved, dropped);
    }
    case 'model': {
      const params: Params = { suite, mode: h.get('mode') || undefined };
      let path = '/model/';
      if (id) {
        const slash = id.indexOf('/');
        const rawMaker = slash < 0 ? id : id.slice(0, slash);
        const name = slash < 0 ? '' : id.slice(slash + 1);
        const maker = rawMaker === '-' ? 'unknown' : (makerMap[rawMaker] ?? rawMaker);
        path = name ? modelPath(`${maker}/${name}`) : `/model/${encodeURIComponent(maker)}/`;
      }
      // `setup` (legacy) names a variant + deployment; the new page focuses the setup
      const setup = h.get('setup');
      if (setup) {
        const sid = maps.setups?.[setup];
        if (sid) params.setup = sid;
        else unresolved.push(setup);
      }
      const variant = h.get('variant');
      if (variant) dropped.push(`variant=${variant}`);
      const deployment = h.get('deployment');
      if (deployment) {
        const did = maps.deployments?.[deployment];
        if (did) params.deployment = did;
        else dropped.push(`deployment=${deployment}`);
      }
      return done(path, params, unresolved, dropped);
    }
    case 'compare': {
      const ids = slugsToSetups(list(id), maps, unresolved);
      return done(comparePath(), { s: ids, mode: h.get('mode') || undefined, suite }, unresolved, dropped);
    }
    case 'todo': {
      const sort = h.get('sort');
      return done(
        todoPath(),
        {
          suite,
          mode: h.get('mode') || undefined,
          sort: sort && sort !== 'easiest' ? sort : undefined,
          all: isOn(h.get('all')) ? '1' : undefined,
        },
        unresolved,
        dropped,
      );
    }
    case 'run':
      // The old runs page was a card list; the new /runs/ is its replacement. `?run=<uuid>` was ignored by the old site.
      return done(runsPath(), {}, unresolved, dropped);
    case 'about':
      return done(aboutPath(), {}, unresolved, dropped);
  }
}
