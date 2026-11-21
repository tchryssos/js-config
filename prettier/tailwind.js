import * as tailwindPlugin from 'prettier-plugin-tailwindcss';

/**
 * Adds Tailwind class sorting to a Prettier config. The Tailwind plugin has
 * to come last, so wrap the finished config:
 * `withTailwind(astroConfig, { tailwindStylesheet: './src/styles/global.css' })`.
 *
 * @param {import('prettier').Config} config
 * @param {{ tailwindStylesheet?: string }} [options] Tailwind v4 has no JS
 *   config; the plugin reads the theme from this stylesheet.
 * @returns {import('prettier').Config}
 */
export function withTailwind(config, options = {}) {
  return {
    ...config,
    ...options,
    plugins: [...(config.plugins ?? []), tailwindPlugin],
  };
}
