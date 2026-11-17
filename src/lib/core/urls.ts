// Pure URL builders for the site's routes (B-01). Paths are relative to the app base (`/crucible-dashboard`);
// `src/lib/paths.ts` adds the base. Every path ends in `/` (trailingSlash is always).

export type Params = Record<string, string | string[] | null | undefined | false>;

const enc = encodeURIComponent;

/** `a=b&c=d,e`: empty values are omitted, list values are comma-joined with each item encoded. */
export function queryString(params: Params = {}): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === false || v === '') continue;
    const value = Array.isArray(v) ? v.map(enc).join(',') : enc(v);
    if (value) parts.push(`${enc(k)}=${value}`);
  }
  return parts.join('&');
}

export function withQuery(path: string, params?: Params): string {
  const q = queryString(params);
  return q ? `${path}?${q}` : path;
}

/** An id that may contain `/` (a model id) as path segments, each encoded. */
const segments = (id: string) => id.split('/').map(enc).join('/');

export const leaderboardPath = () => '/';
export const taskPath = (task: string) => `/task/${enc(task)}/`;
export const modelPath = (model: string) => `/model/${segments(model)}/`;
export const runPath = (uuid: string) => `/run/${enc(uuid)}/`;
export const comparePath = () => '/compare/';
export const runsPath = () => '/runs/';
export const todoPath = () => '/todo/';
export const aboutPath = () => '/about/';
