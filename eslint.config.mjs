// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/src/gen/**'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      // Type-aware linting: rules below need the TypeScript type checker.
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // An un-awaited promise is "fire and forget": errors vanish and the caller
      // may finish (e.g. commit, respond, exit) before the work is done.
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          // node:test's test()/describe() return a promise, but the runner awaits top-level tests itself.
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['test', 'it', 'describe', 'suite'] },
          ],
        },
      ],
      // Passing an async function where a sync callback is expected hides its errors.
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  // Must be last: turns off stylistic rules that would fight with Prettier.
  prettier,
);
