// Which model and maker pages exist, for prerendering: the union over every suite in meta.json, so a model that
// only a past suite has still gets its page.

import { loadIndex, loadMeta } from '$lib/data';
import { UNKNOWN_MAKER } from './shape';

export async function modelEntries(): Promise<{ maker: string; name: string }[]> {
  const meta = await loadMeta(fetch);
  const seen = new Set<string>();
  for (const s of meta.suites) {
    const idx = await loadIndex(fetch, s.id);
    for (const id of Object.keys(idx.entities.models)) seen.add(id);
    for (const id of Object.keys(idx.other)) seen.add(id);
  }
  return [...seen].sort().map((id) => {
    const i = id.indexOf('/');
    return { maker: i < 0 ? UNKNOWN_MAKER : id.slice(0, i), name: i < 0 ? id : id.slice(i + 1) };
  });
}

export async function makerPageEntries(): Promise<{ maker: string }[]> {
  const makers = new Set((await modelEntries()).map((e) => e.maker));
  return [...makers].map((maker) => ({ maker }));
}
