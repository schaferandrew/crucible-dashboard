<script lang="ts">
  import { base } from '$app/paths';

  let { title, blurb }: { title: string; blurb: string } = $props();
</script>

<svelte:head>
  <title>{title} · Crucible</title>
</svelte:head>

<h1>{title}</h1>
<p class="muted">{blurb}</p>
<p><strong>Coming soon.</strong> This page is part of the rewrite and has not been built yet.</p>
<p><a href="{base}/">Back to the leaderboard</a></p>
