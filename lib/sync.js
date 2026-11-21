import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { isMap, isSeq, parseDocument } from 'yaml';

import {
  defaultScripts,
  gitignoreLines,
  knipIgnoredDependencies,
  LEFTHOOK_PREFIX,
  lefthookExtends,
  OXFMT_STYLE,
  STUB_ALTERNATIVES,
  stubs,
  toolDependencies,
  workspaceSettings,
} from './files.js';
import { MANIFEST_KEY, parseManifest } from './manifest.js';

/** @import { Manifest } from './manifest.js' */

const PACKAGE_ROOT = join(import.meta.dirname, '..');
const ownPackage = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'),
);
const sharedFile = (/** @type {string} */ name) =>
  readFileSync(join(PACKAGE_ROOT, 'files', name), 'utf8');

const GITIGNORE_START =
  '# >>> @tchryssos/js-config (managed by `js-config sync`)';
const GITIGNORE_END = '# <<< @tchryssos/js-config';

/** Dev tools a repo shouldn't list itself any more. */
const SUPERSEDED = ['husky', 'lint-staged'];

/**
 * @typedef {object} Result
 * @property {string[]} changed Files that were (or, with `dryRun`, would be) written.
 * @property {string[]} notes Things to tell the user that sync didn't do itself.
 */

class Writer {
  /** @param {string} cwd @param {boolean} dryRun */
  constructor(cwd, dryRun) {
    this.cwd = cwd;
    this.dryRun = dryRun;
    /** @type {string[]} */
    this.changed = [];
  }

  /** @param {string} file */
  read(file) {
    const path = join(this.cwd, file);
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  }

  /** @param {string} file @param {string} content */
  write(file, content) {
    if (this.read(file) === content) return;
    this.changed.push(file);
    if (this.dryRun) return;
    const path = join(this.cwd, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  /**
   * Writes JSON only when the data differs, so a formatter reflowing the file
   * doesn't make every sync look like a change.
   *
   * @param {string} file @param {unknown} data
   */
  writeJson(file, data) {
    const current = this.read(file);
    if (current !== undefined && isDeepStrictEqual(JSON.parse(current), data)) {
      return;
    }
    this.write(file, JSON.stringify(data, null, 2) + '\n');
  }

  /**
   * Same idea as writeJson: only rewrite when the settings differ. Comments
   * are only ever added alongside new keys, so comparing data is enough.
   *
   * @param {string} file @param {import('yaml').Document} doc
   */
  writeYaml(file, doc) {
    const current = this.read(file);
    if (
      current !== undefined &&
      isDeepStrictEqual(parseDocument(current).toJS(), doc.toJS())
    ) {
      return;
    }
    this.write(file, doc.toString({ lineWidth: 0, singleQuote: true }));
  }
}

/**
 * Records the toolchain and features in package.json, writes starting config
 * files that don't exist yet, then syncs.
 *
 * @param {string} cwd
 * @param {Manifest} manifest
 * @returns {Result}
 */
export function init(cwd, manifest) {
  const w = new Writer(cwd, false);
  const pkg = JSON.parse(w.read('package.json') ?? '{}');
  pkg[MANIFEST_KEY] = manifest;
  w.writeJson('package.json', pkg);
  for (const [file, content] of Object.entries(stubs(manifest))) {
    const names = [file, ...(STUB_ALTERNATIVES[file] ?? [])];
    if (names.every((name) => w.read(name) === undefined)) {
      w.write(file, content);
    }
  }
  const result = sync(cwd);
  return {
    changed: [...new Set([...w.changed, ...result.changed])],
    notes: result.notes,
  };
}

/**
 * Brings the managed files in line with the repo's manifest.
 *
 * @param {string} cwd
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Result}
 */
export function sync(cwd, { dryRun = false } = {}) {
  const w = new Writer(cwd, dryRun);
  /** @type {string[]} */
  const notes = [];
  const pkgText = w.read('package.json');
  if (pkgText === undefined) throw new Error(`No package.json in ${cwd}`);
  const pkg = JSON.parse(pkgText);
  const manifest = parseManifest(pkg[MANIFEST_KEY]);

  w.write('.editorconfig', sharedFile('editorconfig'));
  w.write('.nvmrc', sharedFile('nvmrc'));
  if (manifest.features.includes('ci')) {
    w.write('.github/actions/setup/action.yml', sharedFile('setup-action.yml'));
  }
  syncGitignore(w, manifest);
  if (manifest.toolchain === 'ox') {
    const current = JSON.parse(w.read('.oxfmtrc.json') ?? '{}');
    w.writeJson('.oxfmtrc.json', {
      $schema: './node_modules/oxfmt/configuration_schema.json',
      ...current,
      ...OXFMT_STYLE,
    });
  }
  syncWorkspace(w, manifest);
  syncLefthook(w, manifest);
  syncKnip(w, manifest, notes);
  syncPackageJson(w, pkg, manifest, notes);

  if (!dryRun) format(cwd, manifest, w.changed, notes);

  if (manifest.features.includes('tailwind') && manifest.toolchain === 'ox') {
    notes.push(
      'tailwind: class sorting is only wired up for Prettier; set `sortTailwindcss` in .oxfmtrc.json yourself.',
    );
  }
  if (!pkg.scripts?.check) {
    notes.push(
      'There is no `check` script, which the pre-push hook runs. Add one (e.g. typecheck + tests).',
    );
  }
  return { changed: w.changed, notes };
}

/**
 * Runs the repo's formatter over the files sync wrote, so they match the
 * repo's style (e.g. Prettier collapsing short JSON arrays) straight away.
 *
 * @param {string} cwd @param {Manifest} manifest
 * @param {string[]} files @param {string[]} notes
 */
function format(cwd, manifest, files, notes) {
  if (files.length === 0) return;
  const [bin, ...args] =
    manifest.toolchain === 'ox'
      ? ['oxfmt', '--no-error-on-unmatched-pattern']
      : ['prettier', '--write', '--ignore-unknown'];
  const path = join(cwd, 'node_modules', '.bin', bin);
  if (!existsSync(path)) {
    notes.push(
      `${bin} isn't installed yet, so run \`pnpm format\` after \`pnpm install\`.`,
    );
    return;
  }
  const result = spawnSync(path, [...args, ...files], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    notes.push(
      `${bin} failed on the synced files:\n${result.stderr || result.stdout}`,
    );
  }
}

/** @param {Writer} w @param {Manifest} manifest */
function syncGitignore(w, manifest) {
  const block = [
    GITIGNORE_START,
    ...gitignoreLines(manifest),
    GITIGNORE_END,
  ].join('\n');
  const current = w.read('.gitignore') ?? '';
  const start = current.indexOf(GITIGNORE_START);
  const end = current.indexOf(GITIGNORE_END);
  const next =
    start !== -1 && end > start
      ? current.slice(0, start) +
        block +
        current.slice(end + GITIGNORE_END.length)
      : (current.trimEnd() ? current.trimEnd() + '\n\n' : '') + block + '\n';
  w.write('.gitignore', next);
}

/** @param {Writer} w @param {Manifest} manifest */
function syncWorkspace(w, manifest) {
  const doc = parseDocument(w.read('pnpm-workspace.yaml') ?? '');
  if (!isMap(doc.contents)) doc.contents = doc.createNode({});
  for (const { path, value, comment } of workspaceSettings(manifest)) {
    const isNew = !doc.hasIn(path);
    doc.setIn(path, value);
    if (isNew && comment) {
      // Attach the comment to the new key's pair inside its parent map.
      const parent =
        path.length > 1 ? doc.getIn(path.slice(0, -1), true) : doc.contents;
      if (isMap(parent)) {
        const pair = parent.items.find(
          (p) =>
            /** @type {{ value?: unknown }} */ (p.key)?.value === path.at(-1) ||
            p.key === path.at(-1),
        );
        if (pair) {
          const key = doc.createNode(pair.key);
          key.commentBefore = comment;
          pair.key = key;
        }
      }
    }
  }
  w.writeYaml('pnpm-workspace.yaml', doc);
}

/** @param {Writer} w @param {Manifest} manifest */
function syncLefthook(w, manifest) {
  const doc = parseDocument(w.read('lefthook.yml') ?? '');
  if (!isMap(doc.contents)) doc.contents = doc.createNode({});
  const current = doc.get('extends');
  const local = isSeq(current)
    ? current.items
        .map((item) =>
          String(/** @type {{ value?: unknown }} */ (item).value ?? item),
        )
        .filter((path) => !path.startsWith(LEFTHOOK_PREFIX))
    : [];
  const wanted = [...lefthookExtends(manifest), ...local];
  if (!isSeq(current) || !isDeepStrictEqual(current.toJSON(), wanted)) {
    // Keep `extends` first so the file reads top to bottom.
    doc.delete('extends');
    const items = /** @type {import('yaml').YAMLMap} */ (doc.contents).items;
    const pair = doc.createPair('extends', wanted);
    // A header comment sits on the first key; keep it at the top of the file.
    const first = /** @type {import('yaml').Scalar | undefined} */ (
      items[0]?.key
    );
    if (first?.commentBefore) {
      /** @type {import('yaml').Scalar} */ (pair.key).commentBefore =
        first.commentBefore;
      first.commentBefore = undefined;
    }
    items.unshift(pair);
  }
  w.writeYaml('lefthook.yml', doc);
}

/**
 * @param {Writer} w @param {Manifest} manifest @param {string[]} notes
 */
function syncKnip(w, manifest, notes) {
  const wanted = knipIgnoredDependencies(manifest);
  if (!manifest.features.includes('knip') || wanted.length === 0) return;
  const text = w.read('knip.json');
  if (text === undefined) {
    notes.push(
      `knip: add ${wanted.join(', ')} to ignoreDependencies in your knip config; tools load them at runtime, so knip sees them as unused.`,
    );
    return;
  }
  const config = JSON.parse(text);
  /** @type {string[]} */
  const current = config.ignoreDependencies ?? [];
  const missing = wanted.filter((name) => !current.includes(name));
  if (missing.length > 0) {
    w.writeJson('knip.json', {
      ...config,
      ignoreDependencies: [...current, ...missing],
    });
  }
}

/**
 * @param {Writer} w
 * @param {Record<string, any>} pkg
 * @param {Manifest} manifest
 * @param {string[]} notes
 */
function syncPackageJson(w, pkg, manifest, notes) {
  const next = structuredClone(pkg);
  next.engines = { ...next.engines, node: ownPackage.engines.node };

  next.scripts ??= {};
  for (const [name, command] of Object.entries(defaultScripts(manifest))) {
    next.scripts[name] ??= command;
  }

  next.devDependencies ??= {};
  const tools = toolDependencies(manifest);
  for (const name of tools) {
    const wanted =
      ownPackage.devDependencies[name] ?? ownPackage.dependencies[name];
    const have = next.devDependencies[name];
    if (have === undefined || compareRanges(have, wanted) < 0) {
      next.devDependencies[name] = wanted;
    }
  }
  next.devDependencies = sortKeys(next.devDependencies);

  const provided = Object.keys(ownPackage.dependencies).filter(
    (name) =>
      name !== 'yaml' && !tools.includes(name) && name in next.devDependencies,
  );
  if (provided.length > 0) {
    notes.push(
      `Now provided by @tchryssos/js-config, so removable from devDependencies unless imported directly: ${provided.join(', ')}`,
    );
  }
  const superseded = SUPERSEDED.filter((name) => name in next.devDependencies);
  if (superseded.length > 0) {
    notes.push(`Replaced by lefthook; remove: ${superseded.join(', ')}`);
  }
  w.writeJson('package.json', next);
}

/**
 * Compares the lowest version two ranges allow (`^1.2.3`, `~6.0.3`, `1.2.3`).
 *
 * @param {string} a @param {string} b
 */
export function compareRanges(a, b) {
  const parse = (/** @type {string} */ range) =>
    (range.match(/\d+(\.\d+){0,2}/)?.[0] ?? '0').split('.').map(Number);
  const [pa, pb] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** @param {Record<string, string>} object */
function sortKeys(object) {
  return Object.fromEntries(
    Object.entries(object).sort(([a], [b]) => a.localeCompare(b)),
  );
}
