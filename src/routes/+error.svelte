<script lang="ts">
  import { page } from '$app/state';
  import { link } from '$lib/paths';
  import PageHeader from '$lib/ui/PageHeader.svelte';
</script>

<PageHeader
  title={page.status === 404 ? 'Page not found' : 'Something went wrong'}
  crumbs={[{ label: page.status === 404 ? 'Not found' : 'Error' }]}
/>
<p>
  {#if page.status === 404}
    There is no page at <code>{page.url.pathname}</code>.
  {:else}
    {page.error?.message ?? 'The page could not be drawn.'}
  {/if}
  <a href={link('/')}>Back to the leaderboard</a>.
</p>
