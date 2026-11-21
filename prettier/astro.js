import * as astroPlugin from 'prettier-plugin-astro';

import base from './index.js';

/** @type {import('prettier').Config} */
export default {
  ...base,
  plugins: [astroPlugin],
  overrides: [{ files: '*.astro', options: { parser: 'astro' } }],
};
