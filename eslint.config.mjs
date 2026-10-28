import { FlatCompat } from '@eslint/eslintrc';
import prettier from 'eslint-config-prettier';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
      'supabase/.temp/**',
      'agent-spec/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // AGENTS.md §7: named exports only (Next.js route files and tool configs excepted).
    files: ['components/**', 'features/**', 'lib/**', 'types/**', 'fixtures/**', 'emails/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Use named exports (AGENTS.md §7).' },
      ],
    },
  },
  {
    // AGENTS.md §7: client code never imports server-only modules.
    files: ['components/**', 'features/*/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/db', '@/lib/db/*', '@/lib/supabase/server', '@/lib/supabase/admin'],
              message: 'Client code must not import server-only modules.',
            },
          ],
        },
      ],
    },
  },
  prettier,
];

export default eslintConfig;
