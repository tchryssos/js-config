import pluginJs from '@eslint/js';
import { defineConfig } from 'eslint/config';
import eslintPluginAstro from 'eslint-plugin-astro';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * @typedef {object} BaseOptions
 * @property {string} tsconfigRootDir The repo root; pass `import.meta.dirname`.
 * @property {boolean} [astro] Add Astro's recommended and accessibility rules.
 * @property {string[]} [tsconfigs] tsconfig paths for type-aware rules. Leave
 *   out to let typescript-eslint find each file's tsconfig itself; pass them
 *   when a repo has several tsconfigs that don't reference each other.
 * @property {string[]} [ignores] Extra paths to ignore besides `dist/`.
 * @property {string[]} [nodeFiles] Globs that run in Node rather than the
 *   browser. Root-level config files always do.
 */

/**
 * JS + TS rules, type-aware rules for TS (including Astro `<script>` blocks),
 * sorted imports, and optionally Astro's rules.
 *
 * @param {BaseOptions} options
 */
export function base({
  tsconfigRootDir,
  astro = false,
  tsconfigs,
  ignores = [],
  nodeFiles = [],
}) {
  return defineConfig([
    {
      ignores: [
        'dist/',
        // Astro's generated type-declaration cache — not our source.
        ...(astro ? ['.astro/'] : []),
        ...ignores,
      ],
    },
    { languageOptions: { globals: globals.browser } },
    pluginJs.configs.recommended,
    tseslint.configs.recommended,
    ...(astro
      ? [
          eslintPluginAstro.configs.recommended,
          eslintPluginAstro.configs['jsx-a11y-recommended'],
          {
            // Astro files need the TS parser wired in for their frontmatter.
            files: ['**/*.astro'],
            languageOptions: {
              parser: eslintPluginAstro.parser,
              parserOptions: {
                parser: tseslint.parser,
                extraFileExtensions: ['.astro'],
              },
            },
          },
        ]
      : []),
    {
      // Type-aware rules (floating promises, unsafe any, etc.) for TS. This
      // also covers Astro's `<script>` blocks (linted as `x.astro/1_1.ts`),
      // so it has to come after Astro's presets, which switch type
      // information off for them. Frontmatter stays non-type-aware.
      files: ['**/*.{ts,mts,cts}'],
      extends: [tseslint.configs.recommendedTypeCheckedOnly],
      languageOptions: {
        parserOptions: tsconfigs
          ? { project: tsconfigs, tsconfigRootDir }
          : { projectService: true, tsconfigRootDir },
      },
      rules: {
        // node:test's describe/it return promises the runner itself awaits.
        '@typescript-eslint/no-floating-promises': [
          'error',
          {
            allowForKnownSafeCalls: [
              {
                from: 'package',
                package: 'node:test',
                name: ['describe', 'it', 'test'],
              },
            ],
          },
        ],
      },
    },
    {
      // Root-level tool configs (and anything listed) run in Node.
      files: ['*.{js,mjs,cjs,ts,mts,cts}', ...nodeFiles],
      languageOptions: { globals: globals.node },
    },
    {
      plugins: { 'simple-import-sort': simpleImportSort },
      rules: {
        'simple-import-sort/imports': 'warn',
        'simple-import-sort/exports': 'warn',
      },
    },
    ...(astro
      ? [
          {
            rules: {
              'astro/prefer-class-list-directive': 'warn',
              'astro/sort-attributes': 'warn',
              'astro/jsx-a11y/media-has-caption': 'warn',
            },
          },
        ]
      : []),
  ]);
}
