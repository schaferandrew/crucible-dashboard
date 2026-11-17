<script lang="ts">
  import ComparePage from '$lib/pages/compare/ComparePage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<ComparePage {data} />
