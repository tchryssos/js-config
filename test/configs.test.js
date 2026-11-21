// Loads every shared config the way a repo would, so a dependency update
// that breaks an import or a preset name fails here rather than in a site.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { base } from '@tchryssos/js-config/eslint';
import astroPrettier from '@tchryssos/js-config/prettier/astro';
import { withTailwind } from '@tchryssos/js-config/prettier/tailwind';
import { ESLint } from 'eslint';
import * as prettier from 'prettier';
import stylelint from 'stylelint';

const root = import.meta.dirname;

describe('eslint', () => {
  for (const astro of [false, true]) {
    it(`lints with base({ astro: ${astro} })`, async () => {
      const eslint = new ESLint({
        cwd: root,
        overrideConfigFile: true,
        overrideConfig: base({ tsconfigRootDir: root, astro }),
      });
      const [result] = await eslint.lintText('export const a = 1;\n', {
        filePath: 'example.js',
      });
      assert.deepEqual(result?.messages, []);
    });
  }
});

describe('prettier', () => {
  it('formats .astro files with the Tailwind plugin added', async () => {
    // Class sorting itself needs tailwindcss installed, which only the
    // repos have; this checks the plugins load and the Astro parser runs.
    const config = withTailwind(astroPrettier);
    const output = await prettier.format(
      '---\nconst a = 1\n---\n<div class="p-2 flex">{a}</div>\n',
      { ...config, filepath: 'example.astro' },
    );
    assert.match(output, /const a = 1;/);
  });
});

describe('stylelint', () => {
  it('loads the shared config', async () => {
    const config = JSON.parse(
      readFileSync(new URL('../stylelint/index.json', import.meta.url), 'utf8'),
    );
    const { results } = await stylelint.lint({
      code: 'a { color: red; display: block; }\n',
      config,
      configBasedir: root,
    });
    assert.ok(results[0]);
    assert.equal(results[0].invalidOptionWarnings.length, 0);
  });
});
