import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
  { ignores: ['.svelte-kit/', 'build/', 'node_modules/', 'static/data/', 'docs/', '.ci/'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    rules: {
      // Links are built from the `base` path by hand in one helper (src/lib/paths.ts).
      'svelte/no-navigation-without-resolve': 'off',
      // State is immutable values in $state.raw (a DataContext is replaced, never mutated), so plain Sets are right.
      'svelte/prefer-svelte-reactivity': 'off',
    },
  },
);
