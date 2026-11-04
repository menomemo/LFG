// ESLint flat config.
//
// The style baseline is the Google TypeScript Style Guide
// (https://google.github.io/styleguide/tsguide.html). Formatting is Prettier's
// job, configured in .prettierrc.json to Google's settings; the rules here
// cover what a formatter cannot see. See docs/adr/0007 for why the guide is
// tracked with these rules rather than with the `gts` package.
//
// The `packages/core` block is not style. It is the machine-checkable version
// of ADR-0003: without it, that boundary is only a promise.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.expo/**',
      '**/.turbo/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /* docs/code-standards.md: `any` is banned; suppressions carry a reason. */
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',

      /* Parse at the boundary: a cast is not validation. */
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {assertionStyle: 'as', objectLiteralTypeAssertions: 'never'},
      ],

      /* No floating promises: await it, return it, or void it deliberately. */
      '@typescript-eslint/no-floating-promises': [
        'error',
        {ignoreVoid: true, ignoreIIFE: false},
      ],
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/return-await': ['error', 'always'],

      /* Errors are Error subclasses with a stable code, never strings. */
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',

      /* Google casing table, from docs/code-standards.md#naming. */
      '@typescript-eslint/naming-convention': [
        'error',
        {selector: 'default', format: ['camelCase']},
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'forbid',
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {selector: 'typeLike', format: ['PascalCase']},
        {selector: 'enumMember', format: ['UPPER_CASE']},
        {selector: 'typeProperty', format: ['camelCase']},
        /* Database rows and external payloads are snake_case; those objects
           are described by types, so the property names are not ours to pick. */
        {selector: 'objectLiteralProperty', format: null},
        {selector: 'import', format: ['camelCase', 'PascalCase']},
      ],

      /* Unknown is not zero: an unused value is a mistake, not a placeholder. */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
      ],

      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      eqeqeq: ['error', 'always', {null: 'ignore'}],
      'no-console': 'warn',
      curly: ['error', 'multi-line'],
    },
  },

  /* ADR-0003 — packages/core owns the rules and depends on nothing
     environmental. Each pattern below is a boundary this project has already
     decided it needs; the message says which decision, so a future reader who
     hits the error is told why rather than tempted to delete the rule. */
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'react',
                'react/*',
                'react-dom',
                'react-native',
                'expo',
                'expo-*',
              ],
              message:
                'ADR-0003: packages/core must not import a framework. Take what you need as an argument.',
            },
            {
              group: ['@supabase/*'],
              message:
                'ADR-0003: packages/core must not import a database client. Inject a repository interface.',
            },
            {
              group: ['@lfg/adapters', '@lfg/adapters/*'],
              message:
                'ADR-0003: the dependency points inwards. Adapters call core, never the reverse.',
            },
          ],
        },
      ],

      /* The clock is an argument, so scores are reproducible. */
      'no-restricted-globals': [
        'error',
        {
          name: 'process',
          message:
            'ADR-0003: packages/core reads no environment. Pass configuration in.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          /* Zero-argument only: `new Date()` reads the clock, `new Date(iso)`
             parses a value that was handed to us, which is what a boundary
             parser must do. */
          selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
          message:
            'docs/code-standards.md: the clock is an argument. Accept `now: Date` instead.',
        },
        {
          selector:
            'CallExpression[callee.object.name="Date"][callee.property.name="now"]',
          message:
            'docs/code-standards.md: the clock is an argument. Accept `now: Date` instead.',
        },
        {
          selector: 'CallExpression[callee.name="fetch"]',
          message:
            'ADR-0003: packages/core performs no I/O. Inject the fetcher.',
        },
      ],

      /* No escape hatches in the module that computes people's scores. */
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },

  /* React components are PascalCase functions, and a component's return type
     is idiomatically inferred rather than annotated. Neither is a deviation
     from the Google guide so much as a case it does not cover. */
  {
    files: ['apps/**/*.tsx'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {selector: 'default', format: ['camelCase']},
        {
          selector: 'variable',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
        },
        {selector: 'function', format: ['camelCase', 'PascalCase']},
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {selector: 'typeLike', format: ['PascalCase']},
        {selector: 'objectLiteralProperty', format: null},
        {selector: 'import', format: ['camelCase', 'PascalCase']},
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },

  /* Tests may say `any` to build a bad input on purpose, and may use a fixed
     clock. They still may not reach the network. */
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  /* Config files are not application code. Note the spread of
     disableTypeChecked.rules: spreading only the config object would let the
     `rules` key below silently replace it, which fails loudly when a
     type-aware rule then has no type information. */
  {
    files: ['**/*.mjs', '**/*.js', '**/*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/naming-convention': 'off',
    },
  },
);
