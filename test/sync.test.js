import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parse } from 'yaml';

import { compareRanges, init, sync } from '../lib/sync.js';

/** @param {Record<string, string>} files */
function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'js-config-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

const read = (/** @type {string} */ dir, /** @type {string} */ file) =>
  readFileSync(join(dir, file), 'utf8');
const readJson = (/** @type {string} */ dir, /** @type {string} */ file) =>
  JSON.parse(read(dir, file));

describe('init + sync', () => {
  it('sets up an eslint-prettier repo and is then in sync', () => {
    const dir = repo({ 'package.json': '{ "name": "t" }' });
    init(dir, { toolchain: 'eslint-prettier', features: ['astro', 'knip'] });

    assert.deepEqual(sync(dir, { dryRun: true }).changed, []);
    assert.match(read(dir, 'eslint.config.js'), /astro: true/);
    assert.deepEqual(parse(read(dir, 'lefthook.yml')).extends, [
      'node_modules/@tchryssos/js-config/lefthook/eslint-prettier.yml',
      'node_modules/@tchryssos/js-config/lefthook/check.yml',
    ]);
    const pkg = readJson(dir, 'package.json');
    assert.equal(pkg.scripts.knip, 'knip');
    assert.ok(pkg.devDependencies.eslint);
    assert.ok(pkg.devDependencies['eslint-plugin-jsx-a11y']);
    assert.deepEqual(readJson(dir, 'knip.json').ignoreDependencies, [
      'eslint-plugin-jsx-a11y',
    ]);
    assert.equal(pkg.devDependencies.oxlint, undefined);
  });

  it("doesn't add a second config next to an existing one", () => {
    const dir = repo({
      'package.json': '{ "name": "t" }',
      'eslint.config.mjs': 'export default [];',
      '.prettierrc': '{}',
    });
    const { changed } = init(dir, {
      toolchain: 'eslint-prettier',
      features: [],
    });
    assert.ok(!changed.includes('eslint.config.js'));
    assert.ok(!changed.includes('.prettierrc.mjs'));
  });

  it('generates Astro types in CI for Astro repos', () => {
    const astroRepo = repo({ 'package.json': '{ "name": "t" }' });
    init(astroRepo, {
      toolchain: 'eslint-prettier',
      features: ['astro', 'ci'],
    });
    const steps = parse(read(astroRepo, '.github/actions/setup/action.yml'))
      .runs.steps;
    assert.equal(steps.at(-1).run, 'pnpm exec astro sync');

    const plainRepo = repo({ 'package.json': '{ "name": "t" }' });
    init(plainRepo, { toolchain: 'ox', features: ['ci'] });
    assert.doesNotMatch(
      read(plainRepo, '.github/actions/setup/action.yml'),
      /astro/,
    );
  });

  it('sets up an ox repo with the shared code style', () => {
    const dir = repo({ 'package.json': '{ "name": "t" }' });
    init(dir, { toolchain: 'ox', features: [] });

    const oxfmt = readJson(dir, '.oxfmtrc.json');
    assert.equal(oxfmt.printWidth, 80);
    assert.equal(oxfmt.trailingComma, 'all');
    const pkg = readJson(dir, 'package.json');
    assert.equal(pkg.scripts.format, 'oxfmt');
    assert.equal(pkg.devDependencies['eslint-plugin-jsx-a11y'], undefined);
  });

  it('keeps what the repo added itself', () => {
    const dir = repo({
      'package.json': JSON.stringify({
        name: 't',
        scripts: { lint: 'eslint . && custom' },
        devDependencies: { typescript: '^7.0.2' },
        'js-config': { toolchain: 'ox', features: ['stylelint'] },
      }),
      'pnpm-workspace.yaml': 'allowBuilds:\n  # needed\n  sharp: true\n',
      'lefthook.yml':
        'extends:\n  - node_modules/@tchryssos/js-config/lefthook/eslint-prettier.yml\n  - local.yml\npre-commit:\n  jobs:\n    - name: mine\n      run: echo\n',
      '.gitignore': 'secret/\n',
      '.oxfmtrc.json': '{ "ignorePatterns": ["captures/"], "printWidth": 120 }',
    });
    sync(dir);

    const pkg = readJson(dir, 'package.json');
    assert.equal(pkg.scripts.lint, 'eslint . && custom');
    assert.equal(pkg.devDependencies.typescript, '^7.0.2', 'never downgrades');

    const workspace = read(dir, 'pnpm-workspace.yaml');
    assert.match(workspace, /# needed\n {2}sharp: true/);
    assert.equal(parse(workspace).minimumReleaseAge, 4320);

    const lefthook = parse(read(dir, 'lefthook.yml'));
    assert.deepEqual(lefthook.extends, [
      'node_modules/@tchryssos/js-config/lefthook/ox.yml',
      'node_modules/@tchryssos/js-config/lefthook/stylelint.yml',
      'node_modules/@tchryssos/js-config/lefthook/check.yml',
      'local.yml',
    ]);
    assert.equal(lefthook['pre-commit'].jobs[0].name, 'mine');

    assert.match(
      read(dir, '.gitignore'),
      /^secret\/\n\n# >>> @tchryssos\/js-config/,
    );
    assert.deepEqual(readJson(dir, '.oxfmtrc.json').ignorePatterns, [
      'captures/',
    ]);
    assert.equal(readJson(dir, '.oxfmtrc.json').printWidth, 80);
  });

  it('ignores formatting-only differences in managed JSON and YAML', () => {
    const dir = repo({ 'package.json': '{ "name": "t" }' });
    init(dir, { toolchain: 'eslint-prettier', features: ['stylelint'] });
    // Roughly what Prettier does to these files.
    const manifest = readJson(dir, 'package.json');
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
    writeFileSync(
      join(dir, 'pnpm-workspace.yaml'),
      read(dir, 'pnpm-workspace.yaml').replaceAll("'", '"'),
    );
    assert.deepEqual(sync(dir, { dryRun: true }).changed, []);
  });

  it('replaces the gitignore block in place', () => {
    const dir = repo({ 'package.json': '{ "name": "t" }' });
    init(dir, { toolchain: 'ox', features: [] });
    writeFileSync(
      join(dir, '.gitignore'),
      read(dir, '.gitignore') + 'after/\n',
    );
    const pkg = readJson(dir, 'package.json');
    pkg['js-config'].features = ['astro'];
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
    sync(dir);

    const gitignore = read(dir, '.gitignore');
    assert.match(
      gitignore,
      /\.astro\/\n# <<< @tchryssos\/js-config\nafter\/\n$/,
    );
    assert.equal(gitignore.match(/# >>>/g)?.length, 1);
  });
});

describe('compareRanges', () => {
  it('compares the lowest allowed versions', () => {
    assert.ok(compareRanges('^2.1.14', '^2.2.2') < 0);
    assert.ok(compareRanges('^7.0.2', '~6.0.3') > 0);
    assert.equal(compareRanges('~6.0.3', '6.0.3'), 0);
  });
});
