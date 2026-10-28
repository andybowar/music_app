import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const shared = ['node_modules/**', '.next/**', 'agent-spec/**', 'tests/e2e/**'];

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['**/*.test.{ts,tsx}'],
          exclude: [...shared, 'tests/db/**', '**/*.int.test.{ts,tsx}'],
        },
      },
      {
        // Needs a local Supabase stack: `pnpm db:start`, reset with `pnpm db:reset`.
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/db/**/*.test.ts', '**/*.int.test.{ts,tsx}'],
          exclude: shared,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
