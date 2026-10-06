// Prettier, set to the style the code was already written in.
// `npm run format` writes; `npm run lint` checks. Only TypeScript under src/ and the root
// config files are formatted (see the scripts in package.json); docs and CSS are left alone.
/** @type {import('prettier').Config} */
export default {
  printWidth: 100, // the docs wrap at 100
  singleQuote: true, // JSX attributes keep double quotes (jsxSingleQuote stays false)
  trailingComma: 'all',
  arrowParens: 'avoid', // `s => s.id`, as nearly every arrow in src/ is written
  tabWidth: 2,
  semi: true,
};
