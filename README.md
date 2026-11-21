# js-config

Shared tooling config for my JS/TS repos, plus a small CLI for the files
that can't be extended.

- **Extended from the package** (each repo keeps a one-line file):
  tsconfig, ESLint, Prettier, stylelint, oxlint, lefthook.
- **Written by `js-config sync`**: `.editorconfig`, `.nvmrc`, a
  managed block in `.gitignore`, `.vscode/` settings, the supply-chain
  settings in `pnpm-workspace.yaml`, `.oxfmtrc.json` style keys, the CI setup
  action, and minimum tool versions in `package.json`.
- **Left to each repo**: `astro.config`, test runner config, deploy
  workflows, project-specific lint rules, knip entry points.

## Install

```sh
pnpm add -D github:tchryssos/js-config#v0.2.0
pnpm exec js-config init --toolchain eslint-prettier --features astro,stylelint,knip,ci
pnpm install
```

`init` records the choices in `package.json`:

```json
"js-config": { "toolchain": "eslint-prettier", "features": ["astro", "stylelint", "knip", "ci"] }
```

and writes starting config files that don't exist yet. To change features
later, edit that list and run `pnpm exec js-config sync`.

| Toolchain         | Lint / format    |
| ----------------- | ---------------- |
| `eslint-prettier` | ESLint, Prettier |
| `ox`              | oxlint, oxfmt    |

Both use the same code style (80 columns, single quotes, trailing commas
everywhere), so switching doesn't reformat a repo.

| Feature     | Adds                                                     |
| ----------- | -------------------------------------------------------- |
| `astro`     | Astro ESLint + Prettier rules, `.astro/` ignore, esbuild |
| `tailwind`  | Tailwind class sorting (Prettier), VS Code settings      |
| `stylelint` | stylelint config, pre-commit job, `lint` script          |
| `knip`      | knip + `knip` script                                     |
| `ci`        | `.github/actions/setup` (pnpm + Node + install)          |

Always on: TypeScript, lefthook (format + lint on commit, `pnpm check` on
push), the pnpm supply-chain settings, `.editorconfig`, `.nvmrc`.

## The config files

```js
// eslint.config.js
import { base } from '@tchryssos/js-config/eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  base({ tsconfigRootDir: import.meta.dirname, astro: true }),
  // Project-specific config goes here.
]);
```

`base()` also takes `tsconfigs` (for repos with several tsconfigs),
`ignores`, and `nodeFiles` (globs that run in Node instead of the browser).

```js
// .prettierrc.mjs: '@tchryssos/js-config/prettier' or '.../prettier/astro'
export { default } from '@tchryssos/js-config/prettier/astro';

// With Tailwind (its plugin must come last):
import config from '@tchryssos/js-config/prettier/astro';
import { withTailwind } from '@tchryssos/js-config/prettier/tailwind';
export default withTailwind(config, { tailwindStylesheet: './src/styles/global.css' });
```

```jsonc
// tsconfig.json — Node:
{ "extends": "@tchryssos/js-config/tsconfig/node.json" }
// Astro:
{ "extends": ["astro/tsconfigs/strict", "@tchryssos/js-config/tsconfig/base.json"] }

// .stylelintrc.json
{ "extends": "@tchryssos/js-config/stylelint" }

// .oxlintrc.json
{ "extends": ["./node_modules/@tchryssos/js-config/oxlint/base.json"] }
```

`lefthook.yml` lists the shared hook files under `extends`; `sync` keeps that
list in step with the features. Jobs defined in the repo's own `lefthook.yml`
merge with the shared ones by name.

## Updating

1. Change the package (often by backporting something tried in one repo).
2. Bump `version`, tag `vX.Y.Z`, push the tag.
3. In each repo, bump the `#vX.Y.Z` in `package.json` (Renovate does this),
   `pnpm install`, then `pnpm exec js-config sync`.

`sync --check` exits 1 when a repo's managed files are out of date.

## Dependencies

The ESLint, Prettier and stylelint plugins are dependencies of this package,
so repos don't list them. The tools themselves (`eslint`, `prettier`,
`oxlint`, `typescript`, …) stay in each repo so their binaries are on the
path; `sync` raises them to at least the versions in this package's
`devDependencies` and never lowers them.

Every repo installs all the plugins whichever toolchain it uses, and pnpm
auto-installs their `eslint`/`stylelint` peers. That costs some disk space in
`ox` repos, in exchange for one package and one version to bump.
