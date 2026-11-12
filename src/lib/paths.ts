// Links within the app: the pure builders in core/urls.ts plus the deploy base (`/crucible-dashboard`).
// Every internal `href` in a component comes from here.

import { base } from '$app/paths';
import { modelPath, runPath, taskPath, withQuery, type Params } from '$lib/core/urls';

/** `<base><path>?params`. `path` starts with `/` and is relative to the base. */
export function link(path: string, params?: Params): string {
  return base + withQuery(path, params);
}

/** Pages keep the reader's suite when it isn't the current one (ROUTE-08). */
export const suiteParam = (suite: string, current: string): string | undefined =>
  suite === current ? undefined : suite;

export const taskHref = (task: string, suite?: string) => link(taskPath(task), { suite });
export const modelHref = (model: string, suite?: string) => link(modelPath(model), { suite });
export const runHref = (uuid: string, suite?: string) => link(runPath(uuid), { suite });
export const compareHref = (setups: string[], suite?: string) => link('/compare/', { s: setups, suite });
