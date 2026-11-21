// What each toolchain and feature puts in a repo. sync.js applies these;
// keep the decisions here and the file plumbing there.

/** @import { Manifest } from './manifest.js' */

const LEFTHOOK_DIR = 'node_modules/@tchryssos/js-config/lefthook';

/** Must match prettier/index.js, so switching toolchains doesn't reformat. */
export const OXFMT_STYLE = {
  printWidth: 80,
  singleQuote: true,
  trailingComma: 'all',
};

/** @param {Manifest} m */
export function lefthookExtends({ toolchain, features }) {
  return [
    `${LEFTHOOK_DIR}/${toolchain}.yml`,
    ...(features.includes('stylelint')
      ? [`${LEFTHOOK_DIR}/stylelint.yml`]
      : []),
    `${LEFTHOOK_DIR}/check.yml`,
  ];
}

export const LEFTHOOK_PREFIX = `${LEFTHOOK_DIR}/`;

/**
 * Packages a repo installs itself: tool binaries (so `node_modules/.bin` has
 * them) and anything a tool only looks for from the repo root. The versions
 * come from this package's own dependencies or devDependencies.
 *
 * @param {Manifest} m
 */
export function toolDependencies({ toolchain, features }) {
  return [
    'typescript',
    'lefthook',
    '@types/node',
    ...(toolchain === 'eslint-prettier' ? ['eslint', 'prettier'] : []),
    // eslint-plugin-astro looks for jsx-a11y from the directory ESLint runs
    // in, not from its own location, so the repo has to install it. Without
    // it the Astro a11y rules only work under pnpm's bin shims (which set
    // NODE_PATH), not in editor integrations.
    ...(toolchain === 'eslint-prettier' && features.includes('astro')
      ? ['eslint-plugin-jsx-a11y']
      : []),
    ...(toolchain === 'ox' ? ['oxlint', 'oxfmt'] : []),
    ...(features.includes('stylelint') ? ['stylelint'] : []),
    ...(features.includes('knip') ? ['knip'] : []),
  ];
}

/**
 * Scripts added when missing. Existing scripts are never changed, since
 * repos often extend them (e.g. `lint` also running stylelint).
 *
 * @param {Manifest} m
 * @returns {Record<string, string>}
 */
export function defaultScripts({ toolchain, features }) {
  const stylelint = features.includes('stylelint')
    ? " && stylelint '**/*.css' --max-warnings 0"
    : '';
  return {
    ...(toolchain === 'eslint-prettier'
      ? {
          lint: `eslint . --max-warnings 0${stylelint}`,
          format: 'prettier --write .',
          'format:check': 'prettier --check .',
        }
      : {
          lint: `oxlint --deny-warnings${stylelint}`,
          format: 'oxfmt',
          'format:check': 'oxfmt --check',
        }),
    ...(features.includes('knip') ? { knip: 'knip' } : {}),
  };
}

/**
 * pnpm-workspace.yaml settings, with the comment to add when a key is new.
 *
 * @param {Manifest} m
 * @returns {{ path: string[], value: unknown, comment?: string }[]}
 */
export function workspaceSettings({ features }) {
  return [
    {
      path: ['minimumReleaseAge'],
      value: 4320,
      comment:
        " Don't install package versions younger than 3 days (in minutes), so\n" +
        ' a compromised release has time to be noticed before we pick it up.',
    },
    { path: ['minimumReleaseAgeStrict'], value: true },
    { path: ['minimumReleaseAgeIgnoreMissingTime'], value: false },
    {
      path: ['engineStrict'],
      value: true,
      comment:
        ' Fail installs on the wrong Node instead of warning (package.json engines).',
    },
    {
      path: ['allowBuilds', 'lefthook'],
      value: true,
      comment:
        " lefthook's postinstall installs the git hooks from lefthook.yml.",
    },
    ...(features.includes('astro')
      ? [
          {
            path: ['allowBuilds', 'esbuild'],
            value: true,
            comment:
              " esbuild's postinstall fetches its platform-specific binary;\n" +
              ' Vite (via Astro) needs it to run.',
          },
        ]
      : []),
    // @tchryssos/js-config always installs these plugins, so the workarounds
    // apply whichever toolchain or features a repo uses.
    {
      path: [
        'peerDependencyRules',
        'allowedVersions',
        'eslint-plugin-jsx-a11y>eslint',
      ],
      value: '10',
      comment:
        " jsx-a11y's peer range stops at eslint 9, but it runs fine on 10.\n" +
        ' Managed by @tchryssos/js-config; drops once jsx-a11y declares eslint 10.',
    },
    {
      path: [
        'peerDependencyRules',
        'allowedVersions',
        'stylelint-config-idiomatic-order>stylelint-order>stylelint',
      ],
      value: '18',
      comment:
        ' stylelint-config-idiomatic-order pins stylelint-order 6, whose peer\n' +
        ' range stops at stylelint 16; its ordering rule still works on 18.',
    },
  ];
}

const GITIGNORE_BASE = [
  'node_modules/',
  'dist/',
  '.DS_Store',
  '.env',
  '.env.*',
  '!.env.example',
  '# personal Claude Code settings and agent worktrees',
  '.claude/settings.local.json',
  '.claude/worktrees/',
];

/** @param {Manifest} m */
export function gitignoreLines({ features }) {
  return [
    ...GITIGNORE_BASE,
    ...(features.includes('astro')
      ? ['# Astro generated types', '.astro/']
      : []),
  ];
}

/**
 * Other names each tool accepts for its config, so `init` doesn't add a
 * second file next to an existing one.
 *
 * @type {Record<string, string[]>}
 */
export const STUB_ALTERNATIVES = {
  'eslint.config.js': [
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts',
  ],
  '.prettierrc.mjs': [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.yaml',
    '.prettierrc.js',
    '.prettierrc.cjs',
    'prettier.config.js',
    'prettier.config.mjs',
  ],
  '.stylelintrc.json': [
    '.stylelintrc',
    '.stylelintrc.js',
    '.stylelintrc.mjs',
    'stylelint.config.js',
    'stylelint.config.mjs',
  ],
  'knip.json': ['knip.jsonc', '.knip.json', 'knip.ts', 'knip.config.ts'],
  '.oxlintrc.json': ['oxlint.config.ts'],
};

/**
 * Starting config files that `init` writes only when missing. After that
 * they belong to the repo.
 *
 * @param {Manifest} m
 * @returns {Record<string, string>}
 */
export function stubs({ toolchain, features }) {
  const astro = features.includes('astro');
  /** @type {Record<string, string>} */
  const files = {
    'lefthook.yml':
      '# Git hooks, installed by `pnpm install`. Skip once with `git commit --no-verify`.\n' +
      '# The shared hooks come from @tchryssos/js-config (`js-config sync` keeps\n' +
      '# this list current); add or override jobs below by name.\n',
    'tsconfig.json':
      JSON.stringify(
        astro
          ? {
              extends: [
                'astro/tsconfigs/strict',
                '@tchryssos/js-config/tsconfig/base.json',
              ],
              include: ['.astro/types.d.ts', '**/*'],
              exclude: ['dist'],
            }
          : { extends: '@tchryssos/js-config/tsconfig/node.json' },
        null,
        2,
      ) + '\n',
  };

  if (toolchain === 'eslint-prettier') {
    files['eslint.config.js'] = [
      "import { base } from '@tchryssos/js-config/eslint';",
      "import { defineConfig } from 'eslint/config';",
      '',
      'export default defineConfig([',
      astro
        ? '  base({ tsconfigRootDir: import.meta.dirname, astro: true }),'
        : '  base({ tsconfigRootDir: import.meta.dirname }),',
      '  // Project-specific config goes here.',
      ']);',
      '',
    ].join('\n');

    const preset = astro ? 'prettier/astro' : 'prettier';
    files['.prettierrc.mjs'] = features.includes('tailwind')
      ? [
          `import config from '@tchryssos/js-config/${preset}';`,
          "import { withTailwind } from '@tchryssos/js-config/prettier/tailwind';",
          '',
          "export default withTailwind(config, { tailwindStylesheet: './src/styles/global.css' });",
          '',
        ].join('\n')
      : `export { default } from '@tchryssos/js-config/${preset}';\n`;
    files['.prettierignore'] = '# Written by pnpm.\npnpm-lock.yaml\n';
  } else {
    files['.oxlintrc.json'] =
      JSON.stringify(
        {
          $schema: './node_modules/oxlint/configuration_schema.json',
          extends: ['./node_modules/@tchryssos/js-config/oxlint/base.json'],
        },
        null,
        2,
      ) + '\n';
  }

  if (features.includes('stylelint')) {
    files['.stylelintrc.json'] =
      JSON.stringify({ extends: '@tchryssos/js-config/stylelint' }, null, 2) +
      '\n';
  }
  if (features.includes('knip')) {
    files['knip.json'] =
      JSON.stringify(
        { $schema: 'https://unpkg.com/knip@6/schema.json' },
        null,
        2,
      ) + '\n';
  }
  return files;
}
