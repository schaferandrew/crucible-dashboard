<script lang="ts">
  // `/model`: every model with results, under the maker that made it (MODEL-IDX-*). Also what a maker or model
  // that doesn't exist falls back to, with its message (MODEL-URL-02/03).
  import { afterNavigate } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import type { Meta, SuiteIndex } from '$lib/core/types';
  import { ContextState } from '$lib/ui/contextState.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import SuiteBar from '$lib/ui/SuiteBar.svelte';
  import { makerHref, modelHref, suiteParam } from './links';
  import { makerGroups } from './shape';

  let { data, message = null }: { data: { meta: Meta; index: SuiteIndex }; message?: string | null } =
    $props();

  const cs = untrack(() => new ContextState({ meta: data.meta, index: data.index }));
  onMount(() => cs.init());
  afterNavigate(({ type }) => {
    if (type !== 'enter') void cs.syncFromUrl();
  });

  const groups = $derived(makerGroups(cs.index));
  const sq = $derived(suiteParam(cs.ctx.suite, data.meta.current_suite));
</script>

<PageHeader title="Models" docTitle="Models" crumbs={[{ label: 'Models' }]}>
  {#if message}<p class="banner" role="status">{message}</p>{/if}
  <p>
    Every model with results, under the lab that made it (the maker). Select a maker to see its models side by
    side, or a model for its variants and deployments.
  </p>
</PageHeader>

{#if cs.failure}<p class="banner bad" role="alert">{cs.failure}</p>{/if}

<SuiteBar
  index={cs.index}
  meta={data.meta}
  suite={cs.ctx.suite}
  onsuite={(suite) => cs.update({ ...cs.ctx, suite })}
  unknown={cs.unknownSuite}
/>

{#if groups.length === 0}
  <Empty>No models yet.</Empty>
{:else}
  <div class="makers">
    {#each groups as g (g.id)}
      <section>
        <h2>
          <a href={makerHref(g.id, sq)}>{g.label}</a>
          <span class="note">{g.models.length} model{g.models.length === 1 ? '' : 's'}</span>
        </h2>
        <ul>
          {#each g.models as m (m.id)}
            <li>
              <a href={modelHref(m.id, sq)}>{m.name}</a>
              <span class="note">{m.variants} variant{m.variants === 1 ? '' : 's'}</span>
              {#each m.where as w (w)}<span class="tag {w === 'local' ? 'local' : 'cloud'}"
                  >{w === 'local' ? 'local' : 'cloud'}</span
                >{/each}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}

<style>
  .makers {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    gap: var(--space-5) var(--space-6);
  }
  h2 {
    font-size: var(--text-lg);
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
    flex-wrap: wrap;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-1);
  }
  li {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
    flex-wrap: wrap;
  }
  .note {
    font-size: var(--text-sm);
    font-weight: 400;
    color: var(--muted);
  }
</style>
