#!/usr/bin/env node
import { parseArgs } from 'node:util';

import { FEATURES, parseManifest, TOOLCHAINS } from '../lib/manifest.js';
import { init, sync } from '../lib/sync.js';

const USAGE = `Usage:
  tchryssos-config init --toolchain <${TOOLCHAINS.join('|')}> [--features a,b]
  tchryssos-config sync [--check]

Features: ${FEATURES.join(', ')}

init   records the choices in package.json, writes starting config files that
       don't exist yet, then runs sync.
sync   rewrites the managed files (.editorconfig, .nvmrc, .gitignore block,
       .vscode, pnpm-workspace.yaml settings, lefthook extends, tool versions).
       --check only reports what would change, and exits 1 if anything would.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    toolchain: { type: 'string' },
    features: { type: 'string', default: '' },
    check: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const [command] = positionals;
const cwd = process.cwd();

try {
  if (values.help || !command) {
    console.log(USAGE);
  } else if (command === 'init') {
    const manifest = parseManifest({
      toolchain: values.toolchain,
      features: values.features.split(',').filter(Boolean),
    });
    report(init(cwd, manifest), false);
    console.log('\nRun `pnpm install` to pick up the new dependencies.');
  } else if (command === 'sync') {
    const result = sync(cwd, { dryRun: values.check });
    report(result, values.check);
    if (values.check && result.changed.length > 0) process.exitCode = 1;
  } else {
    console.error(`Unknown command "${command}"\n\n${USAGE}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

/** @param {import('../lib/sync.js').Result} result @param {boolean} dryRun */
function report({ changed, notes }, dryRun) {
  if (changed.length === 0) {
    console.log('Everything is in sync.');
  } else {
    console.log(dryRun ? 'Out of sync:' : 'Updated:');
    for (const file of changed) console.log(`  ${file}`);
  }
  for (const note of notes) console.log(`\nNote: ${note}`);
}
