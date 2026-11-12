// The todo page's state: suite, section, sort and "every setup". It plays the part ContextState plays for the
// other pages, but the todo page has no filters and no Combined (OQ-08) and its own parameters (`sort`, `all`),
// which ContextState's codec would drop. Changes write the URL with `replaceState` (B-02); the shared
// `chrome.suite` keeps the tab strip and breadcrumbs on the reader's suite.

import { replaceState } from '$app/navigation';
import type { Meta, SuiteId, SuiteIndex } from '$lib/core/types';
import { asSuiteId } from '$lib/core/types';
import { loadIndex } from '$lib/data';
import { suiteParam } from '$lib/paths';
import { chrome } from '$lib/ui/chrome.svelte';
import { pickSection, sectionChoices } from './build';
import type { SortKey } from './shape';
import { parseTodoUrl, todoSearch } from './url';

export class TodoState {
  readonly meta: Meta;
  index = $state.raw<SuiteIndex>(undefined as never);
  suite = $state<SuiteId>(undefined as never);
  /** The section the reader asked for (URL or click); the one shown is `section`. */
  mode = $state<string | null>(null);
  sort = $state<SortKey>('easiest');
  all = $state(false);
  unknownSuite = $state<string | null>(null);
  failure = $state<string | null>(null);
  loading = $state(false);
  #mounted = false;

  constructor(meta: Meta, index: SuiteIndex) {
    this.meta = meta;
    this.index = index;
    this.suite = index.suite;
  }

  get choices() {
    return sectionChoices(this.index);
  }

  /** The section shown: the requested one, else the first with tasks. */
  get section() {
    return pickSection(this.choices, this.mode);
  }

  #write() {
    if (!this.#mounted) return;
    const q = todoSearch(
      { suite: this.suite, mode: this.mode, sort: this.sort, all: this.all },
      this.meta.current_suite,
    );
    replaceState(`${location.pathname}${q ? '?' + q : ''}`, {});
  }

  async #apply(search: string, write: boolean) {
    const u = parseTodoUrl(search);
    const known = u.suite ? this.meta.suites.some((s) => s.id === u.suite) : true;
    this.unknownSuite = u.suite && !known ? u.suite : null;
    this.sort = u.sort;
    this.all = u.all;
    await this.#setSuite(u.suite && known ? asSuiteId(u.suite) : this.meta.current_suite, false);
    // An unknown or empty section is dropped: the first section with tasks shows instead
    this.mode = u.mode && this.choices.some((c) => c.id === u.mode) ? u.mode : null;
    if (write) this.#write();
  }

  async #setSuite(suite: SuiteId, write: boolean) {
    if (suite !== this.index.suite) {
      this.loading = true;
      this.failure = null;
      try {
        this.index = await loadIndex(fetch, suite);
      } catch (e) {
        this.failure = `Couldn't load ${suite}: ${e instanceof Error ? e.message : String(e)}`;
        return;
      } finally {
        this.loading = false;
      }
    }
    this.suite = suite;
    chrome.suite = suiteParam(suite, this.meta.current_suite) ?? null;
    if (write) this.#write();
  }

  /** Call from `onMount`: reads the URL, then rewrites it canonically. */
  async init() {
    await this.#apply(location.search, false);
    this.#mounted = true;
    this.#write();
  }

  /** After a client navigation to this same route with a different query. */
  async syncFromUrl() {
    if (this.#mounted) await this.#apply(location.search, false);
  }

  /** Changing suite clears the section (TODO-URL-04). */
  async setSuite(suite: SuiteId) {
    this.mode = null;
    this.unknownSuite = null;
    await this.#setSuite(suite, true);
  }
  setMode(id: string) {
    this.mode = id;
    this.#write();
  }
  setSort(sort: SortKey) {
    this.sort = sort;
    this.#write();
  }
  setAll(all: boolean) {
    this.all = all;
    this.#write();
  }
}
