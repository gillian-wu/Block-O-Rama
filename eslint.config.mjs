import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        BOM_SELECTORS: 'readonly',
        BOM_LABELS: 'readonly',
        BOM_DIRECT: 'readonly',
        BOM_DOM: 'readonly',
        BOM_UI: 'readonly',
        BOM_THREADS_SELECTORS: 'readonly',
        BOM_THREADS_LABELS: 'readonly',
      },
    },
  },
  {
    // Define the shared globals the other scripts read.
    files: ['src/selectors.js', 'src/direct.js', 'src/dom.js', 'src/ui.js', 'src/threads-selectors.js'],
    languageOptions: {
      globals: {
        BOM_SELECTORS: 'off',
        BOM_LABELS: 'off',
        BOM_DIRECT: 'off',
        BOM_DOM: 'off',
        BOM_UI: 'off',
        BOM_THREADS_SELECTORS: 'off',
        BOM_THREADS_LABELS: 'off',
      },
    },
    rules: { 'no-unused-vars': 'off' },
  },
  {
    // Mock page scripts served by the tests.
    files: ['test/fixtures/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: globals.browser },
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
