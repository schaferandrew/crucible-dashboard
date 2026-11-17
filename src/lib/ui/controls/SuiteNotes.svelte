<script lang="ts">
  // The suite line and notes under the select (SUITE-02..04) and the unknown-suite notice (B-10).
  import { suiteInfo } from '$lib/core/catalog';
  import { fmtDate } from '$lib/core/format';
  import type { Meta, SuiteIndex } from '$lib/core/types';

  let {
    index,
    meta,
    unknown = null,
  }: {
    index: SuiteIndex;
    meta: Meta;
    /** A suite id the URL asked for that doesn't exist or is hidden. */ unknown?: string | null;
  } = $props();

  const suite = $derived(index.catalog.suite);
  const nTasks = $derived(suiteInfo(index.catalog).tasks.filter((t) => t.status === 'active').length);
  // SUITE-03: only an http(s) or site-absolute changelog link is used
  const changelog = $derived(
    suite.changelog_url && /^(https?:|\/)/.test(suite.changelog_url) ? suite.changelog_url : null,
  );
  const past = $derived(suite.id !== meta.current_suite);
</script>

{#if unknown}
  <p class="banner" role="status">Suite "{unknown}" isn't available, so this is {meta.current_suite}.</p>
{/if}
<p class="line muted">
  {suite.name}{suite.version ? ` (version ${suite.version})` : ''} &middot; {nTasks} scored tasks{suite.cut_at
    ? ` · cut ${fmtDate(suite.cut_at)}`
    : ''}{#if changelog}
    &middot; <a href={changelog} rel="noopener">What changed</a>{/if}
</p>
{#if past}
  <p class="past muted">
    A past suite: its own tasks, tiers and weights, and only the runs that count in it (a run counts in every
    suite that pins its task at the version it ran).
  </p>
{/if}

<style>
  .line,
  .past {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
  }
</style>
