<script lang="ts">
  import TaskPage from '$lib/pages/task/TaskPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<TaskPage {data} />
