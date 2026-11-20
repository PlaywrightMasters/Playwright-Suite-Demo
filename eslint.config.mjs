// @ts-check
import js from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/', 'playwright-report/', 'test-results/', 'blob-report/'],
  },

  // Node scripts (demo break/fix helpers, this config file).
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // Browser code served by the demo app. Plain ES modules, no build step.
  {
    files: ['app/public/js/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.browser, sourceType: 'module' },
    rules: {
      eqeqeq: 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // All TypeScript: app server, framework and tests. Type-aware rules.
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
      eqeqeq: 'error',
      'prefer-const': 'error',
    },
  },

  // Test-specific rules: catch missing awaits, focused tests and brittle waits.
  {
    files: ['tests/**/*.ts', 'src/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      'playwright/no-focused-test': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-force-option': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expect*', '*.expect*'] },
      ],
    },
  },

  // Page objects and helpers legitimately branch on optional inputs inside test.step().
  {
    files: ['src/**/*.ts'],
    rules: { 'playwright/no-conditional-in-test': 'off' },
  },
);
