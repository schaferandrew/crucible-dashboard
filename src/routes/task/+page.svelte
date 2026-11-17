<script lang="ts">
  import TaskIndexPage from '$lib/pages/task/TaskIndexPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<TaskIndexPage {data} />
