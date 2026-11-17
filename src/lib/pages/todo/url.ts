// The todo page's URL codec (TODO-URL-01..04): `?suite=<id>&mode=<id>&sort=<key>&all=1`. The page keeps no
// Combined and no filters (OQ-08), so this is the whole state. Same parameter names as the old hash.
// Pure: never throws, and anything unreadable falls back to its default.

import { SORT_KEYS, type SortKey } from './shape';

export interface TodoUrl {
  /** The requested suite id, or null when absent. Validation against the suite list is the caller's. */
  suite: string | null;
  /** The requested section id, or null (the page then uses the first section that has tasks). */
  mode: string | null;
  sort: SortKey;
  all: boolean;
}

function decode(v: string): string {
  try {
    return decodeURIComponent(v.replace(/\+/g, ' '));
  } catch {
    return v;
  }
}

function params(search: string): Map<string, string> {
  const out = new Map<string, string>();
  const s = search.startsWith('?') ? search.slice(1) : search;
  for (const part of s.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = decode(eq < 0 ? part : part.slice(0, eq));
    if (!out.has(k)) out.set(k, eq < 0 ? '' : decode(part.slice(eq + 1)));
  }
  return out;
}

export function parseTodoUrl(search: string): TodoUrl {
  const p = params(search);
  const sort = p.get('sort') ?? '';
  return {
    suite: p.get('suite') || null,
    mode: p.get('mode') || null,
    sort: (SORT_KEYS as readonly string[]).includes(sort) ? (sort as SortKey) : 'easiest',
    all: p.get('all') === '1',
  };
}

/** The query string (no `?`). A parameter at its default (current suite, no mode, easiest, off) is left out. */
export function todoSearch(s: TodoUrl, currentSuite: string): string {
  const parts: string[] = [];
  const add = (k: string, v: string) => parts.push(`${k}=${encodeURIComponent(v)}`);
  if (s.suite && s.suite !== currentSuite) add('suite', s.suite);
  if (s.mode) add('mode', s.mode);
  if (s.sort !== 'easiest') add('sort', s.sort);
  if (s.all) parts.push('all=1');
  return parts.join('&');
}
