// About reads the current suite's catalog (ABOUT-08). The rules of each task live in its task file, which also
// carries every run of the task, so the files are read here at build time and only the rules are kept: the page
// ships a few KB instead of fetching dozens of files in the browser.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeIndex, normalizeMeta } from '$lib/core/normalize';
import { shapeAbout } from '$lib/pages/about/shape';
import type { PageServerLoad } from './$types';

export const prerender = true;

const read = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(resolve('static/data', path), 'utf8'));

export const load: PageServerLoad = async () => {
  const meta = normalizeMeta(await read('meta.json'));
  const { catalog } = normalizeIndex(await read(`${meta.current_suite}/index.json`));
  const rules: Record<string, string[]> = {};
  await Promise.all(
    catalog.tasks
      .filter((t) => t.status === 'active')
      .map(async (t) => {
        try {
          const file = (await read(`${meta.current_suite}/tasks/${t.id}.json`)) as {
            task?: { rules?: unknown };
          };
          const r = file.task?.rules;
          if (Array.isArray(r)) rules[t.id] = r.filter((x): x is string => typeof x === 'string');
        } catch {
          // a task without a file simply has no rules to list
        }
      }),
  );
  return { about: shapeAbout(catalog, rules, meta.crucible_version) };
};
