<script lang="ts">
  import ModelIndex from '$lib/pages/model/ModelIndex.svelte';

  let { data } = $props();
</script>

<ModelIndex {data} />
