<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import { suiteInfo } from '$lib/core/catalog';
  import { COMBINED } from '$lib/core/types';
  import { link } from '$lib/paths';
  import { indexSections, provisionalCount } from '$lib/pages/task/shape';
  import TaskIndex from '$lib/pages/task/TaskIndex.svelte';
  import { ContextState } from '$lib/ui/contextState.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import { writeProvisional } from '$lib/ui/prefs';
  import SuiteBar from '$lib/ui/SuiteBar.svelte';

  let { data } = $props();

  const cs = untrack(() => new ContextState({ meta: data.meta, index: data.index }));
  onMount(() => cs.init());
  afterNavigate(({ type }) => {
    if (type !== 'enter') void cs.syncFromUrl();
  });

  const info = $derived(suiteInfo(cs.index.catalog));
  const sections = $derived(indexSections(cs.index, cs.ctx.section, cs.ctx.provisional));
  const hidden = $derived(cs.ctx.provisional ? 0 : provisionalCount(cs.index, cs.ctx.section));
  const total = $derived(provisionalCount(cs.index, COMBINED));

  const chips = $derived([
    ...(info.hasCombined ? [{ id: COMBINED as string, label: info.combinedLabel }] : []),
    ...info.modes.map((m) => ({ id: m.id as string, label: m.label })),
  ]);
  const shownCount = $derived(sections.reduce((n, s) => n + s.count, 0));
</script>

<PageHeader title="Crucible tasks" docTitle="Crucible tasks" crumbs={[{ label: 'Tasks' }]} />

{#if cs.failure}<p class="banner bad" role="alert">{cs.failure}</p>{/if}

<SuiteBar
  index={cs.index}
  meta={data.meta}
  suite={cs.ctx.suite}
  onsuite={(suite) => cs.update({ ...cs.ctx, suite })}
  unknown={cs.unknownSuite}
/>

<div class="controls">
  {#if chips.length > 1}
    <div class="field">
      <span class="lbl" id="task-sections">Section</span>
      <div class="seg" role="radiogroup" aria-labelledby="task-sections">
        {#each chips as c (c.id)}
          <button
            type="button"
            role="radio"
            aria-checked={cs.ctx.section === c.id}
            onclick={() =>
              cs.ctx.section !== c.id && cs.update({ ...cs.ctx, section: c.id as typeof cs.ctx.section })}
            >{c.label}</button
          >
        {/each}
      </div>
    </div>
  {/if}
  {#if total}
    <div class="prov">
      <label>
        <input
          type="checkbox"
          checked={cs.ctx.provisional}
          onchange={(e) => {
            writeProvisional(e.currentTarget.checked);
            void cs.update({ ...cs.ctx, provisional: e.currentTarget.checked });
          }}
        />
        Show provisional tasks
      </label>
      <span class="muted" aria-live="polite">
        {#if cs.ctx.provisional}
          Provisional tasks are listed and marked; they never count toward any score.
        {:else if hidden}
          {hidden} provisional {hidden === 1 ? 'task is' : 'tasks are'} hidden.
        {/if}
      </span>
    </div>
  {/if}
</div>

<ErrorBoundary what="the task list">
  <TaskIndex
    {sections}
    suiteName={cs.index.catalog.suite.name}
    shown={shownCount}
    href={(id) =>
      link(`/task/${encodeURIComponent(id)}/`, {
        suite: cs.ctx.suite === data.meta.current_suite ? undefined : cs.ctx.suite,
        provisional: cs.ctx.provisional ? '1' : undefined,
      })}
  />
</ErrorBoundary>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-3) var(--space-5);
    margin-bottom: var(--space-4);
  }
  .field {
    display: grid;
    gap: 0.2rem;
  }
  .lbl {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 2px;
    background: var(--tray);
    border-radius: var(--radius);
  }
  .seg button {
    border: 0;
    background: transparent;
    border-radius: var(--radius);
    padding: 0.3rem 0.7rem;
    font-size: var(--text-sm);
    color: var(--fg);
  }
  .seg button[aria-checked='true'] {
    background: var(--surface);
    font-weight: 700;
    box-shadow: 0 0 0 1px var(--border-strong);
  }
  .prov {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
  }
</style>
