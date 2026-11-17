<script lang="ts">
  import RunPage from '$lib/pages/run/RunPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<RunPage {data} />
