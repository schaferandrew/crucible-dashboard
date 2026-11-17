// Links of the model pages. Paths come from `$lib/paths` / `core/urls`; only the maker level is local.

import { link, modelHref, suiteParam } from '$lib/paths';

export const modelsHref = (suite?: string) => link('/model/', { suite });
export const makerHref = (maker: string, suite?: string) =>
  link(`/model/${encodeURIComponent(maker)}/`, { suite });
export { modelHref, suiteParam };
