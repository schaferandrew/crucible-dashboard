// The page-side owner of a DataContext: reads it from the URL on mount, loads another suite's index when the
// reader switches, resolves it against the catalog, and writes it back with `replaceState` (B-02: filter,
// sort and toggle changes never add history entries; navigating to an entity does, via links / `goto`).
//
// A page constructs one per route component:
//   const state = new ContextState({ meta: data.meta, index: data.index });
//   onMount(() => state.init());
//   afterNavigate(({ type }) => type !== 'enter' && state.syncFromUrl());
// and passes `state.index`, `state.ctx` and `state.update` to ControlPanel.

import { replaceState } from '$app/navigation';
import {
  contextToSearch,
  defaultContext,
  parseContext,
  resolveContext,
  sameContext,
  type ContextEnv,
  type DataContext,
  type Filters,
} from '$lib/core/context';
import type { Meta, SuiteIndex } from '$lib/core/types';
import { loadIndex } from '$lib/data';
import { link, suiteParam } from '$lib/paths';
import type { Params } from '$lib/core/urls';
import { chrome } from './chrome.svelte';
import { readProvisional } from './prefs';

export interface ContextStateOptions {
  meta: Meta;
  /** The current suite's index (what the route's `load` fetched). */
  index: SuiteIndex;
  /**
   * Dimensions this page pins (a model page pins `model`). They are forced into every context and never
   * written to the URL, because the path says them.
   */
  pin?: Filters;
}

export class ContextState {
  readonly meta: Meta;
  readonly pin: Filters;
  index = $state.raw<SuiteIndex>(undefined as never);
  ctx = $state.raw<DataContext>(undefined as never);
  /** A suite the URL asked for that is unknown or hidden (B-10): the page shows a notice and uses the current suite. */
  unknownSuite = $state<string | null>(null);
  failure = $state<string | null>(null);
  loading = $state(false);
  #mounted = false;

  constructor(opts: ContextStateOptions) {
    this.meta = opts.meta;
    this.pin = opts.pin ?? {};
    this.index = opts.index;
    this.ctx = this.#pinned(resolveContext(defaultContext(this.env), opts.index.catalog));
  }

  get env(): ContextEnv {
    return { currentSuite: this.meta.current_suite, suites: this.meta.suites.map((s) => s.id) };
  }

  #pinned(ctx: DataContext): DataContext {
    return Object.keys(this.pin).length ? { ...ctx, filters: { ...ctx.filters, ...this.pin } } : ctx;
  }

  /** The query string (no `?`) of a context, without pinned dimensions. */
  search(ctx: DataContext, idx: SuiteIndex = this.index): string {
    const filters = { ...ctx.filters };
    for (const k of Object.keys(this.pin)) delete (filters as Record<string, unknown>)[k];
    return contextToSearch({ ...ctx, filters }, this.env, idx.catalog);
  }

  #write(ctx: DataContext, idx: SuiteIndex) {
    if (!this.#mounted) return;
    const search = this.search(ctx, idx);
    replaceState(`${location.pathname}${search ? '?' + search : ''}`, {});
  }

  /** Call from `onMount`: reads the URL (and the remembered provisional choice), then rewrites it canonically. */
  async init(): Promise<void> {
    const parsed = parseContext(location.search, this.env, readProvisional());
    this.unknownSuite = parsed.unknownSuite;
    await this.update(parsed.ctx, { write: false });
    this.#mounted = true;
    this.#write(this.ctx, this.index);
  }

  /** After a client navigation to this same route with a different query (e.g. clicking the tab again). */
  async syncFromUrl(): Promise<void> {
    if (!this.#mounted) return;
    const parsed = parseContext(location.search, this.env, readProvisional());
    this.unknownSuite = parsed.unknownSuite;
    if (!sameContext(this.#pinned(parsed.ctx), this.ctx)) await this.update(parsed.ctx, { write: false });
  }

  /** Apply a new context: loads the suite's index if it changed, resolves the section, updates the URL. */
  update = async (next: DataContext, opts: { write?: boolean } = {}): Promise<void> => {
    let idx = this.index;
    if (next.suite !== idx.suite) {
      this.loading = true;
      this.failure = null;
      try {
        idx = await loadIndex(fetch, next.suite);
      } catch (e) {
        this.failure = `Couldn't load ${next.suite}: ${e instanceof Error ? e.message : String(e)}`;
        return;
      } finally {
        this.loading = false;
      }
    }
    const resolved = this.#pinned(resolveContext(next, idx.catalog));
    this.index = idx;
    this.ctx = resolved;
    chrome.suite = suiteParam(resolved.suite, this.meta.current_suite) ?? null;
    if (opts.write !== false) this.#write(resolved, idx);
  };

  /** A link to another page that keeps the reader's suite (ROUTE-08). */
  href(path: string, params: Params = {}): string {
    return link(path, { suite: suiteParam(this.ctx.suite, this.meta.current_suite), ...params });
  }
}
