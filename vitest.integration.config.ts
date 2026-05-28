import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Integration-test Vitest configuration — runs tests that hit a real Prisma
 * SQLite database (e.g. session.integration.test.ts, auth.integration.test.ts,
 * category.integration.test.ts).
 *
 * Aligns with Requirement 29.4: integration tests use a dedicated
 * `DATABASE_URL=file:./test.db` so they never share state with the
 * developer's working database; each suite is responsible for running
 * `db:reset` + fixture seeding before its cases.
 *
 * Run with:
 *   pnpm vitest --run --config vitest.integration.config.ts
 */
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'file:./test.db';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/test/**/*.integration.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'dist/**'],
    // Integration tests touch a shared SQLite file; run them serially so the
    // per-case `db:reset` + fixture seeding stays deterministic.
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // SQLite reset + migrations can be slow on cold caches.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    css: false,
    clearMocks: true,
    restoreMocks: true,
    env: {
      DATABASE_URL: 'file:./test.db',
    },
  },
});
