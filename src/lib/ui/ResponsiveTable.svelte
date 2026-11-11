<script lang="ts" generics="T">
  // One table primitive for every page (spec 6.12, MAIN-RESP-01/03, A11Y-03/04): a semantic <table> at
  // >= 640px and a card per row below, both from the same column definitions. Only one layout is in the DOM
  // once mounted; before that (prerender, first paint) both are present and CSS shows the right one, so there
  // is no flash on either width.
  //
  //  - Sortable headers: <th scope="col" aria-sort> holding a <button>. In cards, a "Sort by" select.
  //  - Row links: pass `href`; the row-header cell becomes a real <a> (the whole card is clickable through it).
  //  - Cell content: columns give plain `value()` text; for anything richer pass a `cell` snippet and switch on
  //    `col.id`. The snippet's third argument says which layout it is drawing.
  import { onMount, type Snippet } from 'svelte';
  import Empty from './Empty.svelte';
  import { CARD_QUERY, type Column, type SortState } from './table';

  let {
    rows,
    columns,
    rowKey,
    caption,
    sort,
    onsort,
    href,
    cell,
    empty = 'Nothing to show.',
    rowClass,
  }: {
    rows: readonly T[];
    columns: readonly Column<T>[];
    rowKey: (row: T) => string;
    /** Accessible name of the table (visually hidden). */
    caption: string;
    sort?: SortState;
    onsort?: (key: string) => void;
    /** Where a row goes; the row-header cell becomes a link. */
    href?: (row: T) => string | null | undefined;
    cell?: Snippet<[row: T, col: Column<T>, layout: 'table' | 'card']>;
    /** Shown instead of the table when there are no rows. */
    empty?: string;
    rowClass?: (row: T) => string | undefined;
  } = $props();

  // null until mounted: both layouts are rendered and CSS picks
  let wide: boolean | null = $state(null);
  onMount(() => {
    const mq = matchMedia(CARD_QUERY);
    wide = mq.matches;
    const on = (e: MediaQueryListEvent) => (wide = e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  const tableCols = $derived(columns.filter((c) => !c.tableHide));
  const cardCols = $derived(columns.filter((c) => !c.cardHide));
  const title = $derived(columns.find((c) => c.rowHeader));
  const cardBody = $derived(cardCols.filter((c) => !c.rowHeader));
  const sortCols = $derived(columns.filter((c) => c.sortable));

  const ariaSort = (c: Column<T>): 'ascending' | 'descending' | 'none' | undefined =>
    !c.sortable ? undefined : sort?.key !== c.id ? 'none' : sort.dir === 1 ? 'ascending' : 'descending';

  const text = (c: Column<T>, r: T) => {
    const v = c.value?.(r);
    return v === null || v === undefined || v === '' ? '—' : String(v);
  };
</script>

{#snippet content(row: T, col: Column<T>, layout: 'table' | 'card')}
  {#if cell}{@render cell(row, col, layout)}{:else}{text(col, row)}{/if}
{/snippet}

{#if rows.length === 0}
  <Empty>{empty}</Empty>
{:else}
  {#if wide !== false}
    <div class="scroll" class:pre={wide === null}>
      <table>
        <caption class="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {#each tableCols as c (c.id)}
              <th scope="col" class:end={c.align === 'end'} aria-sort={ariaSort(c)} title={c.title}>
                {#if c.sortable && onsort}
                  <button type="button" class="sorter" onclick={() => onsort(c.id)}>
                    {c.header}{#if sort?.key === c.id}<span aria-hidden="true"
                        >{sort.dir === 1 ? ' ↑' : ' ↓'}</span
                      >{/if}
                  </button>
                {:else}
                  {c.header}
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row (rowKey(row))}
            {@const to = href?.(row)}
            <tr class={rowClass?.(row)}>
              {#each tableCols as c (c.id)}
                {#if c.rowHeader}
                  <th scope="row" class="name {c.class ?? ''}" class:end={c.align === 'end'}>
                    {#if to}<a class="rowlink" href={to}>{@render content(row, c, 'table')}</a
                      >{:else}{@render content(row, c, 'table')}{/if}
                  </th>
                {:else}
                  <td class={c.class} class:end={c.align === 'end'}>{@render content(row, c, 'table')}</td>
                {/if}
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if wide !== true}
    <div class="cardwrap" class:pre={wide === null}>
      {#if onsort && sortCols.length}
        <div class="cardsort">
          <label>
            Sort by
            <select value={sort?.key} onchange={(e) => onsort(e.currentTarget.value)}>
              {#each sortCols as c (c.id)}<option value={c.id}>{c.header}</option>{/each}
            </select>
          </label>
          {#if sort}
            <button
              type="button"
              aria-label="Sorted {sort.dir === 1 ? 'ascending' : 'descending'}: reverse"
              onclick={() => onsort(sort.key)}>{sort.dir === 1 ? '↑' : '↓'}</button
            >
          {/if}
        </div>
      {/if}
      <ul class="cards" aria-label={caption}>
        {#each rows as row (rowKey(row))}
          {@const to = href?.(row)}
          <li class="card {rowClass?.(row) ?? ''}">
            {#if title}
              <div class="ctitle">
                {#if to}<a class="rowlink" href={to}>{@render content(row, title, 'card')}</a
                  >{:else}{@render content(row, title, 'card')}{/if}
              </div>
            {/if}
            {#each cardBody as c (c.id)}
              <div class="kv">
                {#if c.cardLabel !== false}<span class="k">{c.cardLabel ?? c.header}</span>{/if}
                <span class="v {c.class ?? ''}">{@render content(row, c, 'card')}</span>
              </div>
            {/each}
          </li>
        {/each}
      </ul>
    </div>
  {/if}
{/if}

<style>
  /* Wide tables scroll sideways in their own box, never the page (MAIN-RESP-03) */
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }
  th,
  td {
    padding: var(--space-2) var(--space-3);
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--border);
  }
  thead th {
    color: var(--muted);
    font-weight: 700;
    white-space: nowrap;
  }
  th.end,
  td.end {
    text-align: right;
  }
  tbody th.name {
    font-weight: 600;
    min-width: 12em;
  }
  .sorter {
    background: none;
    border: 0;
    padding: 0;
    font-weight: inherit;
    color: inherit;
    text-align: inherit;
  }
  .sorter:hover {
    color: var(--accent);
  }
  .rowlink {
    color: inherit;
    text-decoration: none;
  }
  .rowlink:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  .cardsort {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    font-size: var(--text-sm);
  }
  .cardsort select,
  .cardsort button {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
    padding: 0.25rem 0.5rem;
  }
  .cards {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .card {
    position: relative;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border);
    font-size: var(--text-sm);
  }
  .ctitle {
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  /* The whole card is one link target, through the title's <a> */
  .card .rowlink::after {
    content: '';
    position: absolute;
    inset: 0;
  }
  .kv {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 3px 0;
  }
  .k {
    color: var(--muted);
  }
  .v {
    text-align: right;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  /* Before mount (prerender) both layouts exist; show the one for this width */
  @media (min-width: 640px) {
    .cardwrap.pre {
      display: none;
    }
  }
  @media (max-width: 639px) {
    .scroll.pre {
      display: none;
    }
  }
</style>
