/** The key in a repo's package.json that records its choices. */
export const MANIFEST_KEY = 'js-config';

export const TOOLCHAINS = /** @type {const} */ (['eslint-prettier', 'ox']);
export const FEATURES = /** @type {const} */ ([
  'astro',
  'tailwind',
  'stylelint',
  'knip',
  'ci',
]);

/**
 * @typedef {(typeof TOOLCHAINS)[number]} Toolchain
 * @typedef {(typeof FEATURES)[number]} Feature
 * @typedef {{ toolchain: Toolchain, features: Feature[] }} Manifest
 */

/**
 * @param {unknown} value
 * @returns {Manifest}
 */
export function parseManifest(value) {
  if (typeof value !== 'object' || value === null) {
    throw new Error(
      `package.json has no "${MANIFEST_KEY}" section. Run \`js-config init\` first.`,
    );
  }
  const { toolchain, features = [] } = /** @type {Record<string, unknown>} */ (
    value
  );
  if (!TOOLCHAINS.includes(/** @type {Toolchain} */ (toolchain))) {
    throw new Error(
      `"${MANIFEST_KEY}.toolchain" must be one of: ${TOOLCHAINS.join(', ')}`,
    );
  }
  if (!Array.isArray(features)) {
    throw new Error(`"${MANIFEST_KEY}.features" must be an array`);
  }
  const unknown = features.filter((f) => !FEATURES.includes(f));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown feature(s): ${unknown.join(', ')}. Known: ${FEATURES.join(', ')}`,
    );
  }
  return {
    toolchain: /** @type {Toolchain} */ (toolchain),
    features: /** @type {Feature[]} */ (features),
  };
}
