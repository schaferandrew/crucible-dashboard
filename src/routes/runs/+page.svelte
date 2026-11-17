<script lang="ts">
  import RunsPage from '$lib/pages/runs/RunsPage.svelte';
  import type { PageData } from './$types';

  let view: RunsPage;
  // SvelteKit reads snapshots from the route component.
  export const snapshot = {
    capture: () => view.snapshot.capture(),
    restore: (value: Parameters<RunsPage['snapshot']['restore']>[0]) => view.snapshot.restore(value),
  };

  let { data }: { data: PageData } = $props();
</script>

<RunsPage {data} bind:this={view} />
