import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, chrome: 'readonly', BOM_SELECTORS: 'readonly', BOM_LABELS: 'readonly', BOM_DIRECT: 'readonly' },
    },
  },
  {
    // Defines the shared globals the other scripts read.
    files: ['src/selectors.js', 'src/direct.js'],
    languageOptions: { globals: { BOM_SELECTORS: 'off', BOM_LABELS: 'off', BOM_DIRECT: 'off' } },
    rules: { 'no-unused-vars': 'off' },
  },
  {
    // page.evaluate() callbacks run in the browser.
    files: ['test/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
