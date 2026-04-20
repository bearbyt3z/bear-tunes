import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import stylistic from '@stylistic/eslint-plugin';

export default defineConfig(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'eslint.config.mjs',
    ],
  },

  js.configs.recommended,

  {
    // Treat .cjs files as CommonJS explicitly, because ESLint does not apply
    // the correct module/runtime context for them by default.
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },

  {
    files: ['**/*.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      importPlugin.flatConfigs.recommended,
      importPlugin.flatConfigs.typescript,
    ],
    plugins: {
      '@stylistic': stylistic,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
    rules: {
      '@typescript-eslint/prefer-regexp-exec': 'off',

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',

      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/only-throw-error': 'error',

      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',

      '@typescript-eslint/restrict-template-expressions': 'error',
      '@typescript-eslint/restrict-plus-operands': 'error',

      // Core stylistic rules (from `stylisticTypeChecked`, but explicitly enabled for clarity)
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',

      '@stylistic/semi': ['error', 'always'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/no-multiple-empty-lines': ['error', {
        max: 1,
        maxEOF: 0,
        maxBOF: 0,
      }],

      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Import ordering is intentionally not enforced for now.
      // The preferred long-term rule is `import/order`, grouped by import origin
      // and alphabetized within groups, but `eslint-plugin-import` is currently
      // incompatible with the ESLint v10 rule API.
      // Re-enable once compatibility lands.
      // Tracking: https://github.com/import-js/eslint-plugin-import/issues/3227
      //
      // TODO: Planned config:
      // 'import/order': ['error', {
      //   groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
      //   'newlines-between': 'always',
      //   alphabetize: { order: 'asc', caseInsensitive: true },
      // }],

      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/*'],
            message: 'Do not use @/ aliases. Use relative imports or package.json imports like #tools.',
          },
        ],
      }],

      'max-len': ['error', {
        code: 150,
        ignoreComments: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
      }],

      'no-restricted-syntax': ['error',
        {
          selector: 'ForInStatement',
          message: 'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
        },
        {
          selector: 'LabeledStatement',
          message: 'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
        },
        {
          selector: 'WithStatement',
          message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
        },
      ],
    },
  },
);
