<script lang="ts">
  import MainPage from '$lib/pages/main/MainPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<MainPage {data} />
