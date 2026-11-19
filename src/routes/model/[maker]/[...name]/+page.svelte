<script lang="ts">
  import ModelIndex from '$lib/pages/model/ModelIndex.svelte';
  import ModelPage from '$lib/pages/model/ModelPage.svelte';

  let { data } = $props();
</script>

{#if data.found}
  <!-- A fresh page state per model: the component reads its model once -->
  {#key data.model}
    <ModelPage data={{ meta: data.meta, index: data.index, model: data.model, runs: data.runs }} />
  {/key}
{:else}
  <ModelIndex {data} message="No model “{data.model}” has results on Crucible. Pick one below." />
{/if}
