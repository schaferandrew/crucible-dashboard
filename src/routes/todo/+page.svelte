<script lang="ts">
  import TodoPage from '$lib/pages/todo/TodoPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<TodoPage {data} />
