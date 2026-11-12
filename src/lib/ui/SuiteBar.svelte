<script lang="ts">
  // The suite bar for pages that have no ControlPanel (SUITE-01..04): select, suite line, notes. A page with a
  // ControlPanel doesn't need this: the panel embeds the same two parts.
  import type { Meta, SuiteId, SuiteIndex } from '$lib/core/types';
  import SuiteNotes from './SuiteNotes.svelte';
  import SuiteSelect from './SuiteSelect.svelte';

  let {
    index,
    meta,
    suite,
    onsuite,
    unknown = null,
  }: {
    index: SuiteIndex;
    meta: Meta;
    suite: SuiteId;
    onsuite: (suite: SuiteId) => void;
    unknown?: string | null;
  } = $props();
</script>

<div class="suitebar">
  <SuiteSelect {meta} value={suite} onchange={onsuite} />
  <SuiteNotes {index} {meta} {unknown} />
</div>

<style>
  .suitebar {
    margin-bottom: var(--space-4);
  }
</style>
