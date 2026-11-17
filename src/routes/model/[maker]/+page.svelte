<script lang="ts">
  import MakerPage from '$lib/pages/model/MakerPage.svelte';
  import ModelIndex from '$lib/pages/model/ModelIndex.svelte';

  let { data } = $props();
</script>

{#if data.maker}
  <!-- A fresh page state per maker: the component reads its maker once -->
  {#key data.maker}
    <MakerPage data={{ meta: data.meta, index: data.index, maker: data.maker }} />
  {/key}
{:else}
  <ModelIndex {data} message="There is no maker “{data.asked}” in the results. Pick one below." />
{/if}
