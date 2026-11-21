// Keep in step with OXFMT_STYLE in lib/files.js, so switching toolchains
// doesn't reformat a repo.
/** @type {import('prettier').Config} */
export default {
  printWidth: 80,
  singleQuote: true,
  trailingComma: 'all',
};
