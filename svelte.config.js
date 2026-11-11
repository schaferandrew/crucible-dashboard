import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** Served by GitHub Pages at /crucible-dashboard/ (dev uses the same base). */
const base = '/crucible-dashboard';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined, precompress: false, strict: true }),
    paths: { base, relative: false },
    prerender: { handleHttpError: 'fail', handleMissingId: 'fail' },
  },
};

export default config;
