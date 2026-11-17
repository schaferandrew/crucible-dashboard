<script lang="ts">
  import About from '$lib/pages/about/About.svelte';

  let { data } = $props();
</script>

<About view={data.about} />
